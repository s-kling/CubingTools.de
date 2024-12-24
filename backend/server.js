const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const bodyParser = require('body-parser'); // Add body-parser middleware

const app = express();
const httpPort = 80; // Default http port
const httpsPort = 443; // Default https port

const privateKey = fs.readFileSync('./backend/credentials/cubingtools_private_key.key');
const certificate = fs.readFileSync('./backend/credentials/cubingtools_ssl_certificate.cer');
const credentials = { key: privateKey, cert: certificate };

const logFilePath = path.join(__dirname, 'log.txt');
let requests = 0;

// Initialize or read the visitor count
function initializerequests() {
    if (fs.existsSync(logFilePath)) {
        const data = fs.readFileSync(logFilePath, 'utf8');
        const lines = data.split('\n');
        requests = parseInt(lines[0].trim(), 10) || 0;
    } else {
        requests = 0;
    }
}

// Update the log file with each request
function updateLogFile(logEntry) {
    requests++;
    const data = fs.existsSync(logFilePath) ? fs.readFileSync(logFilePath, 'utf8') : '';
    const lines = data.split('\n').slice(1);
    const newContent = `${requests}\n${logEntry}${lines.join('\n')}`;
    fs.writeFileSync(logFilePath, newContent, 'utf8');
}

initializerequests();

app.use((req, res, next) => {
    if (req.secure) {
        const now = new Date();
        const timestamp = now.toISOString();
        const dayOfWeek = now.toLocaleString('en-US', { weekday: 'long' });
        const hour = now.getHours(); // New field for peak traffic analysis
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];
        const method = req.method;
        const path = req.path;
        const logMessage = `Request to ${path}`;

        res.on('finish', () => {
            const status = res.statusCode;
            const responseTime = new Date() - now;

            // Updated log entry
            let logEntry = `${timestamp} - IP: ${ip} - ${method} ${path} - User-Agent: ${userAgent} - Status: ${status} - Response Time: ${responseTime}ms - Day: ${dayOfWeek} - Hour: ${hour}\n`;

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
const submitRegistrationRoute = require('./API/submitRegistration');

app.use(toolsRoutes);
app.use(apiRoutes);
app.use(pagesRoutes);
app.use(submitRegistrationRoute);

const httpsServer = https.createServer(credentials, app);

httpsServer.listen(httpsPort, () => {
    console.log('Listening for https://')
});

http.createServer((req, res) => {
    res.writeHead(301, { 'Location': `https://${req.headers.host}${req.url}` });
    res.end();
}).listen(httpPort, () => {
    console.log('HTTP server running on port 80 and redirecting to HTTPS');
});