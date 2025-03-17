const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const bodyParser = require('body-parser');

const app = express();
const httpsPort = 443; // Default https port
const betaPort = 8443; // Port for beta testing
const betaTest = true;

// Load the SSL certificate and private key
const privateKey = fs.readFileSync('./backend/credentials/cubingtools_private_key.key');
const certificate = fs.readFileSync('./backend/credentials/cubingtools_ssl_certificate.cer');
const credentials = privateKey && certificate ? { key: privateKey, cert: certificate } : null;

const logFilePath = path.join(__dirname, 'log', 'server.log');
const logRetentionPeriod = 14 * 24 * 60 * 60 * 1000; // 2 weeks in milliseconds

// Update the log file with each request
function updateLogFile(logEntry) {
    const now = new Date();
    const data = fs.existsSync(logFilePath) ? fs.readFileSync(logFilePath, 'utf8') : '';
    const lines = data.split('\n').filter((line) => {
        const timestamp = new Date(line.split(' - ')[0]);
        return now - timestamp <= logRetentionPeriod;
    });
    const newContent = `${logEntry}${lines.join('\n')}`;
    fs.writeFileSync(logFilePath, newContent, 'utf8');
}

app.use((req, res, next) => {
    if (req.secure) {
        const now = new Date();
        const timestamp = now.toISOString();
        const dayOfWeek = now.toLocaleString('en-US', { weekday: 'long' });
        const userAgent = req.headers['user-agent'];
        const method = req.method;
        const path = req.path;

        res.on('finish', () => {
            const status = res.statusCode;
            const responseTime = new Date() - now;

            // Updated log entry
            let logEntry = `${timestamp} - ${method} ${path} - User-Agent: ${userAgent} - Status: ${status} - Response Time: ${responseTime}ms - Day: ${dayOfWeek}\n`;

            if (path === '/api/send-email') {
                logEntry += `Body: ${JSON.stringify(req.body)}\n`;
            }

            updateLogFile(logEntry);
        });

        next();
    } else {
        res.redirect(`https://${req.headers.host}${req.url}`);
    }
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Use body-parser middleware to parse JSON and URL-encoded bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Import and use the API routes
const toolsRoutes = require('./API/tools');
const apiRoutes = require('./API/api');
const pagesRoutes = require('./API/routes');

app.use(toolsRoutes);
app.use(apiRoutes);
app.use(pagesRoutes);

const httpsServer = https.createServer(credentials, app);

if (betaTest) {
    httpsServer.listen(betaPort, () => {
        console.log(`Listening for https:// on port ${betaPort}`);
    });
} else {
    httpsServer.listen(httpsPort, () => {
        console.log('Listening for https://');
    });
}

process.on('SIGINT', () => {
    console.log('Received SIGINT. Shutting down gracefully...');
    httpsServer.close();
    process.exit(0);
});

setInterval(() => statusUpdate(), 24 * 60 * 60 * 1000); // Log status every 24 hours

function statusUpdate() {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    const logFileSize = fs.existsSync(logFilePath) ? fs.statSync(logFilePath).size : 0;
    const statusLog = `
        Status Update ${betaTest ? 'Beta' : ''}:
        - Uptime: ${Math.floor(uptime / 60)} minutes
        - Memory Usage: RSS ${Math.round(memoryUsage.rss / 1024 / 1024)} MB, 
                        Heap Total ${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB, 
                        Heap Used ${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB
        - Log File Size: ${Math.round(logFileSize / 1024)} KB
    `;
    console.log(statusLog);
}
