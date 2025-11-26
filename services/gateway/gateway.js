const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const db = require('./db'); 

const app = express();
app.use(express.json());
app.use(cors());

const workerServices = [
    'http://localhost:3001',
    'http://localhost:3002'
];
let currentWorkerIndex = 0;



app.post('/tasks', async (req, res) => {
   
    const { n } = req.body;
    if (n > 100000000) { 
        return res.status(400).json({ error: "Занадто складна задача! Максимум 100 млн." });
    }

   
    const taskId = Date.now().toString(); 
    const newTask = {
        id: taskId,
        status: 'pending', 
        progress: 0,
        inputData: req.body
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


app.get('/tasks/:id', async (req, res) => {
    const task = await db.getTaskById(req.params.id);
    
    if (!task) {
        return res.status(404).json({ error: 'Задачу не знайдено' });
    }
    
    res.json(task); 
});


app.get('/tasks', async (req, res) => {
    const tasks = await db.getAllTasks();
    res.json(tasks);
});


app.post('/internal/update-status', async (req, res) => {
    const { taskId, status, progress, result, workerPort } = req.body;
    
    console.log(`[Update] Задача ${taskId}: ${progress}% (${status})`);

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