const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());    

const port = process.argv[2];
if (!port) {
    console.log('Error: Port required (e.g. node worker.js 3001)');
    process.exit(1);
}

async function reportStatus(gatewayUrl, taskId, status, progress, result = null) {
    try {
        await fetch(`${gatewayUrl}/internal/update-status`, {
            method: 'POST',
            body: JSON.stringify({
                taskId,
                status,
                progress,
                result,
                workerPort: port 
            }),
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error(`Не вдалося відправити звіт на Gateway: ${error.message}`);
    }
}

function calculateTrapezoid(funcStr, a, b, n, taskId, gatewayUrl) {
    try {
        const f = x => eval(funcStr);
        let h = (b - a) / n;
        let sum = (f(a) + f(b)) / 2;

        const reportStep = Math.max(Math.floor(n / 100), 1000); 

        for (let i = 1; i < n; i++) {
            sum += f(a + i * h);
            if (i % reportStep === 0) {
                const currentProgress = Math.round((i / n) * 100);
                reportStatus(gatewayUrl, taskId, 'processing', currentProgress);
            }
        }
        
        return h * sum;
    } catch (e) {
        throw new Error("Помилка у функції: " + e.message);
    }
}

app.post('/calculate', async (req, res) => {
    const { funcStr, a, b, n, taskId, gatewayUrl } = req.body;

    console.log(`[Worker ${port}] Почав задачу ${taskId} (n=${n})`);

    res.json({ status: 'started' });

    try {
        await reportStatus(gatewayUrl, taskId, 'processing', 0);

        const result = calculateTrapezoid(funcStr, a, b, n, taskId, gatewayUrl);

        console.log(`[Worker ${port}] Задача ${taskId} завершена.`);
        await reportStatus(gatewayUrl, taskId, 'completed', 100, result);

    } catch (error) {
        console.error(`[Worker ${port}] Помилка задачі ${taskId}:`, error);
        await reportStatus(gatewayUrl, taskId, 'failed', 0, error.message);
    }
});

app.listen(port, () => {
    console.log(` Воркер запущено на http://localhost:${port}`);
});