const express = require('express');
const cors = require('cors'); 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http'); 
const { Server } = require('socket.io'); 
const db = require('./db');

const app = express();
app.use(express.json({ limit: '5kb' }));
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });


io.on('connection', (socket) => {
    socket.on('join_task', (taskId) => { socket.join(taskId); });
});

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Auth required' });
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

app.post('/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Data required' });
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        const user = await db.createUser(username, hashedPassword);
        res.json({ message: 'User created', userId: user.id });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await db.findUserByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(400).json({ error: 'Invalid creds' });
    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET);
    res.json({ token, username: user.username });
});

app.post('/tasks', authenticateToken, async (req, res) => {
    const { n } = req.body;
    if (n > 100000000) return res.status(400).json({ error: "N too big" });

    try {
        const userTasks = await db.getTasksByUserId(req.user.id);
        if (userTasks.length >= 50) return res.status(400).json({ error: "Limit reached" });
    } catch (err) { return res.status(500).json({ error: "DB Error" }); }

    const taskId = Date.now().toString();
    const newTask = {
        id: taskId, 
        status: 'pending', 
        progress: 0, 
        inputData: req.body, 
        userId: req.user.id 
    };

    try { 
        await db.createTask(newTask); 
    } catch (e) { return res.status(500).json({ error: "DB Error" }); }

    res.json({ taskId, status: 'pending' });


});

app.get('/tasks', authenticateToken, async (req, res) => {
    const tasks = await db.getTasksByUserId(req.user.id);
    res.json(tasks);
});

app.post('/tasks/cancel', authenticateToken, async (req, res) => {
    const { taskId } = req.body;
    await db.updateTask(taskId, { status: 'cancelled' });
    io.to(taskId).emit('task_update', { taskId, status: 'cancelled' });
    res.json({ message: 'Cancelled' });
});


app.post('/internal/update-status', async (req, res) => {
    const { taskId, status, progress, result, workerPort } = req.body;

    const task = await db.getTaskById(taskId);
    if (task && task.status === 'cancelled') {
        return res.json({ stop: true });
    }

    if (workerPort) console.log(`[Update :${workerPort}] Task ${taskId}: ${progress}%`);
    await db.updateTask(taskId, { status, progress, result });
    io.to(taskId).emit('task_update', { taskId, status, progress, result });
    
    res.json({ received: true, stop: false });
});

const gatewayPort = 3000;
server.listen(gatewayPort, () => {
    console.log(`Gateway (Passive Mode) running on http://localhost:${gatewayPort}`);
});