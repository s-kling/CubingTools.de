const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const bodyParser = require('body-parser'); // Add body-parser middleware

const app = express();
const httpsPort = 443; // Default https port
const betaPort = 8443; // Port for beta testing
const betaTest = false; // Set to false to disable beta testing

// Load the SSL certificate and private key
const privateKey = fs.readFileSync('./backend/credentials/cubingtools_private_key.key');
const certificate = fs.readFileSync('./backend/credentials/cubingtools_ssl_certificate.cer');
const credentials = { key: privateKey, cert: certificate };

const logFilePath = path.join(__dirname, 'server.log');
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
        const userAgent = req.headers['user-agent'];
        const method = req.method;
        const path = req.path;

        res.on('finish', () => {
            const status = res.statusCode;
            const responseTime = new Date() - now;

            // Updated log entry
            let logEntry = `${timestamp} - ${method} ${path} - User-Agent: ${userAgent} - Status: ${status} - Response Time: ${responseTime}ms - Day: ${dayOfWeek} - Hour: ${hour}\n`;

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
const submitRegistrationRoute = require('./API/submitRegistration');
const pagesRoutes = require('./API/routes');

app.use(toolsRoutes);
app.use(apiRoutes);
app.use(submitRegistrationRoute);
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
