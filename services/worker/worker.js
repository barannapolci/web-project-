
const express = require('express');

const app = express();

app.use(express.json());

function calculateTrapezoid(funcStr, a, b, n) {
    try {
       
        const f = x => eval(funcStr);

        let h = (b - a) / n; 
        let sum = (f(a) + f(b)) / 2; 

        for (let i = 1; i < n; i++) {
            sum += f(a + i * h);
        }
        
        return h * sum; 
    } catch (e) {
        
        return "Помилка у функції: " + e.message;
    }
}


app.post('/calculate', (req, res) => {
    
    const { funcStr, a, b, n } = req.body;// розпаковані данні з json

   
    console.log(`[Worker на порту ${port}]: Отримав завдання: f=${funcStr}, a=${a}, b=${b}, n=${n}`);
    
    const result = calculateTrapezoid(funcStr, a, b, n);
    
    res.json({ 
        result: result,
        workerPort: port 
    });
});


const port = process.argv[2];

if (!port) {
    console.log('ПОМИЛКА: Потрібно вказати порт запуску!');
    console.log('Приклад: node worker.js 3001');
    process.exit(1); 
}

app.listen(port, () => {
    console.log(`✅ Воркер (сервіс обчислень) запущено на http://localhost:${port}`);
});