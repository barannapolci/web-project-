const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

const port = process.argv[2];
if (!port) { console.log('Port required'); process.exit(1); }

async function reportStatus(gatewayUrl, taskId, status, progress, result = null) {
    try {
        const response = await fetch(`${gatewayUrl}/internal/update-status`, {
            method: 'POST',
            body: JSON.stringify({ taskId, status, progress, result, workerPort: port }),
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        return data.stop; 
    } catch (error) {
        console.error(`Error reporting: ${error.message}`);
        return false;
    }
}

async function calculateTrapezoid(funcStr, a, b, n, taskId, gatewayUrl) {
    try {
        const f = x => eval(funcStr);
        let h = (b - a) / n;
        let sum = (f(a) + f(b)) / 2;
        const reportStep = Math.max(Math.floor(n / 100), 1000); 

        for (let i = 1; i < n; i++) {
            sum += f(a + i * h);

            if (i % reportStep === 0) {
                const currentProgress = Math.round((i / n) * 100);
                
                const shouldStop = await reportStatus(gatewayUrl, taskId, 'processing', currentProgress);
                
                if (shouldStop) {
                    console.log(`[Worker ${port}] Task ${taskId} CANCELLED.`);
                    return null; 
                }

                await new Promise(resolve => setTimeout(resolve, 1));
            }
        }
        return h * sum;
    } catch (e) { throw new Error("Calc error: " + e.message); }
}

app.post('/calculate', async (req, res) => {
    const { funcStr, a, b, n, taskId, gatewayUrl } = req.body;
    console.log(`[Worker ${port}] Start task ${taskId}`);
    res.json({ status: 'started' });

    try {
        await reportStatus(gatewayUrl, taskId, 'processing', 0);
        
        const result = await calculateTrapezoid(funcStr, a, b, n, taskId, gatewayUrl);

        if (result === null) return;

        console.log(`[Worker ${port}] Task ${taskId} done.`);
        await reportStatus(gatewayUrl, taskId, 'completed', 100, result);

    } catch (error) {
        console.error(`[Worker ${port}] Error:`, error);
        await reportStatus(gatewayUrl, taskId, 'failed', 0, error.message);
    }
});

app.listen(port, () => {
    console.log(` Worker running on port ${port}`);
});