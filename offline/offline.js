// Incase the main server is down, use this as a backup server displaying server maintenance
import express from 'express';
import path from 'path';
let betaTest = process.argv.includes('--beta');
const port = betaTest ? 8001 : 8000;

const app = express();

// Route the offline.html file for all requests
app.get('*', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'offline', 'offline.html'));
});

app.listen(port, () => {
    console.log(`Offline server is running on port ${port}`);
});
