const express = require('express');
const fetch = require('node-fetch'); // Потрібен, щоб надсилати запити *від* сервера
const cors = require('cors'); // Потрібен, щоб дозволити запити з браузера (React)

// 2. ІНІЦІАЛІЗАЦІЯ
const app = express();

app.use(express.json()); // Щоб розуміти JSON-запити від React

app.use(cors());

const workerServices = [
    'http://localhost:3001', // Адреса 1-го воркера
    'http://localhost:3002'  // Адреса 2-го воркера
];

let currentWorkerIndex = 0;

app.post('/api/calculate', async (req, res) => {
    
    const targetWorkerUrl = workerServices[currentWorkerIndex];
    

    currentWorkerIndex = (currentWorkerIndex + 1) % workerServices.length;

    console.log(`[Gateway]: Отримав запит. Перенаправляю на воркера -> ${targetWorkerUrl}`);

    try {

        const response = await fetch(`${targetWorkerUrl}/calculate`, { // Надсилаємо на адресу воркера
            method: 'POST',
            body: JSON.stringify(req.body), // 'req.body' - це те, що прислав React. Ми його передаємо далі.
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();
        
        res.json(data);

    } catch (error) {
        console.error(`[Gateway]: Помилка при зверненні до воркера ${targetWorkerUrl}`, error.message);
        res.status(500).json({ error: 'Сервіс обчислень тимчасово недоступний' });
    }
});

const gatewayPort = 3000;
app.listen(gatewayPort, () => {
    console.log(`✅ API Gateway (Диспетчер) запущено на http://localhost:${gatewayPort}`);
});