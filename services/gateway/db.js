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
async function getTasksByUserId(userId) { 
    const res = await pool.query('SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return res.rows;
}

async function createTask(taskObj) {
    const query = `
        INSERT INTO tasks (id, status, progress, input_data, user_id)  -- 1. Додали user_id сюди
        VALUES ($1, $2, $3, $4, $5)                                    -- 2. Додали $5
        RETURNING *
    `;
    const values = [taskObj.id, taskObj.status, taskObj.progress, taskObj.inputData, taskObj.userId]; 
    
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

async function createUser(username, passwordHash) {
    const query = `INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username`;
    try {
        const res = await pool.query(query, [username, passwordHash]);
        return res.rows[0];
    } catch (err) {
        if (err.code === '23505') throw new Error('Такий юзер вже існує');
        throw err;
    }
}

async function findUserByUsername(username) {
    const res = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return res.rows[0];
}

module.exports = { 
    getAllTasks, 
    createTask, 
    updateTask, 
    getTaskById,
    createUser,
    findUserByUsername,
    getTasksByUserId
};