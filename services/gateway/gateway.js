const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken');
const db = require('./db'); 

const app = express();
app.use(express.json());
app.use(cors());

const workerServices = [
    'http://localhost:3001',
    'http://localhost:3002'
];
let currentWorkerIndex = 0;


function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN_CODE"

    if (!token) return res.status(401).json({ error: 'Потрібна авторизація' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Невірний токен' });
        req.user = user; // Зберігаємо інфо про юзера в запит
        next(); // Пропускаємо далі
    });
}

app.post('/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Введіть логін і пароль' });

    // Хешуємо пароль
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        const user = await db.createUser(username, hashedPassword);
        res.json({ message: 'Юзера створено', userId: user.id });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await db.findUserByUsername(username);

    if (!user) return res.status(400).json({ error: 'Юзера не знайдено' });

    // Перевіряємо пароль
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(400).json({ error: 'Невірний пароль' });

    // Видаємо токен
    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET);
    res.json({ token: token, username: user.username });
});

app.post('/tasks',authenticateToken, async (req, res) => {
   
    const { n } = req.body;
    if (n > 100000000) { 
        return res.status(400).json({ error: "Занадто складна задача! Максимум 100 млн." });
    }

   
    const taskId = Date.now().toString(); 
    const newTask = {
        id: taskId,
        status: 'pending', 
        progress: 0,
        inputData: req.body,
        userId:req.user.id
    };

    try {
        await db.createTask(newTask); 
        console.log(`[Gateway] Задача ${taskId} створена і записана в БД.`);
    } catch (err) {
        return res.status(500).json({ error: "Помилка бази даних" });
    }

 
    res.json({ taskId: taskId, status: 'pending' });

   
    const workerUrl = workerServices[currentWorkerIndex];
    currentWorkerIndex = (currentWorkerIndex + 1) % workerServices.length;

  
    const workerPayload = {
        ...req.body,
        taskId: taskId, 
        gatewayUrl: 'http://localhost:3000' 
    };

    console.log(`[Gateway] Відправляю задачу ${taskId} на воркер ${workerUrl}`);

    fetch(`${workerUrl}/calculate`, {
        method: 'POST',
        body: JSON.stringify(workerPayload),
        headers: { 'Content-Type': 'application/json' }
    }).catch(err => {
        console.error(`Помилка запуску воркера: ${err.message}`);
        db.updateTask(taskId, { status: 'failed' });
    });
});


app.get('/tasks/',authenticateToken, async (req, res) => {
    const task = await db.getTasksByUserId(req.user.id);
    
    if (!task) {
        return res.status(404).json({ error: 'юзера немає(' });
    }
    
    res.json(task); 
});

app.get('/tasks/:id', authenticateToken, async (req, res) => {
    const task = await db.getTaskById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Немає' });
    res.json(task);
});





app.post('/internal/update-status', async (req, res) => {
    const { taskId, status, progress, result } = req.body;
    
console.log(`[Update from :${req.body.workerPort}] Задача ${taskId}: ${progress}% (${status})`);
    await db.updateTask(taskId, {
        status,
        progress,
        result
    });
    
    res.json({ received: true });
});

const gatewayPort = 3000;
app.listen(gatewayPort, () => {
    console.log(`Gateway (Менеджер черги) запущено на http://localhost:${gatewayPort}`);
});