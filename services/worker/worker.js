require('dotenv').config();
const { Pool } = require('pg');
const fetch = require('node-fetch');


const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const port = process.argv[2]; 
const GATEWAY_URL = 'http://localhost:3000'; 

console.log(`[Worker ${port}] Запущено в режимі  (Pull Model)`);

async function getNextTask() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        
        const queryText = `
            SELECT * FROM tasks 
            WHERE status = 'pending' 
            ORDER BY created_at ASC 
            LIMIT 1 
            FOR UPDATE SKIP LOCKED
        `;
        const res = await client.query(queryText);

        if (res.rows.length === 0) {
            await client.query('ROLLBACK');
            return null;
        }

        const task = res.rows[0];

        await client.query(`UPDATE tasks SET status = 'processing' WHERE id = $1`, [task.id]);
        
        await client.query('COMMIT'); 
        return task;

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Помилка при отриманні задачі:', err);
        return null;
    } finally {
        client.release();
    }
}

async function reportToGateway(taskId, status, progress, result = null) {
    try {
        const response = await fetch(`${GATEWAY_URL}/internal/update-status`, {
            method: 'POST',
            body: JSON.stringify({ taskId, status, progress, result, workerPort: port }),
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        return data.stop; 
    } catch (error) {
        console.error('Gateway не відповідає:', error.message);
        return false;
    }
}

async function processTask(task) {
    const { funcStr, a, b, n } = task.input_data; 
    const taskId = task.id;

    console.log(`[Worker ${port}]  Взяв задачу ${taskId} (n=${n})`);

    try {
        const f = x => eval(funcStr);
        let h = (b - a) / n;
        let sum = (f(a) + f(b)) / 2;
        const reportStep = Math.max(Math.floor(n / 100), 1000);

        for (let i = 1; i < n; i++) {
            sum += f(a + i * h);

            if (i % reportStep === 0) {
                const currentProgress = Math.round((i / n) * 100);
                
                const shouldStop = await reportToGateway(taskId, 'processing', currentProgress);
                
                if (shouldStop) {
                    console.log(`[Worker ${port}]  Задача ${taskId} скасована клієнтом.`);
                    return; 
                }

                await new Promise(r => setTimeout(r, 1));
            }
        }

        const result = h * sum;
        console.log(`[Worker ${port}]  Задача ${taskId} готова.`);
        
        await reportToGateway(taskId, 'completed', 100, result);

    } catch (err) {
        console.error(`[Worker ${port}] Помилка обчислень:`, err);
        await reportToGateway(taskId, 'failed', 0, err.message);
    }
}

async function startWorkerLoop() {
    while (true) {
        const task = await getNextTask();

        if (task) {
            await processTask(task);
        } else {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

startWorkerLoop();