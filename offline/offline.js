// Incase the main server is down, use this as a backup server displaying server maintenance
const express = require('express');
const path = require('path');
let betaTest = process.argv.includes('--beta');
const port = betaTest ? 8001 : 8000;

const app = express();

// Route the offline.html file for all requests
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'offline.html'));
});

app.listen(port, () => {
    console.log(`Offline server is running on port ${port}`);
});
