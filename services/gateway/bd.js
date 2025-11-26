require('dotenv').config();// створює змінну в процес енв 
const { Pool } = require('pg'); 

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false 
    }
});

async function getAllTasks() {
    try {
        const res = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
        return res.rows;
    } catch (err) {
        console.error('Помилка БД (getAllTasks):', err);
        return [];
    }
}

async function createTask(taskObj) {
    const query = `
        INSERT INTO tasks (id, status, progress, input_data)
        VALUES ($1, $2, $3, $4)
        RETURNING *
    `;
    const values = [taskObj.id, taskObj.status, taskObj.progress, taskObj.inputData];
    
    try {
        const res = await pool.query(query, values);
        return res.rows[0];
    } catch (err) {
        console.error('Помилка БД (createTask):', err);
        throw err;
    }
}

async function updateTask(id, updates) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (updates.status !== undefined) {
        fields.push(`status = $${paramIndex++}`);
        values.push(updates.status);
    }
    if (updates.progress !== undefined) {
        fields.push(`progress = $${paramIndex++}`);
        values.push(updates.progress);
    }
    if (updates.result !== undefined) {
        fields.push(`result = $${paramIndex++}`);
        values.push(JSON.stringify(updates.result)); // Результат зберігаємо як текст
    }

    if (fields.length === 0) return null;

    values.push(id);
    const query = `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

    try {
        const res = await pool.query(query, values);
        return res.rows[0];
    } catch (err) {
        console.error('Помилка БД (updateTask):', err);
    }
}

async function getTaskById(id) {
    try {
        const res = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
        return res.rows[0];
    } catch (err) {
        console.error('Помилка БД (getTaskById):', err);
        return null;
    }
}

module.exports = { getAllTasks, createTask, updateTask, getTaskById };