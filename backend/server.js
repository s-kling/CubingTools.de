const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const bodyParser = require('body-parser');

const app = express();
const httpsPort = 443;
const betaPort = 8443;
const betaTest = process.argv.includes('--beta');
const debug = process.argv.includes('--debug');

// Load SSL certificate and private key
const privateKey = fs.readFileSync('./backend/credentials/cubingtools_private_key.key');
const certificate = fs.readFileSync('./backend/credentials/cubingtools_ssl_certificate.cer');
const credentials = { key: privateKey, cert: certificate };

const logFilePath = betaTest
    ? path.join(__dirname, 'log', 'beta.log')
    : path.join(__dirname, 'log', 'server.log');
const logRetentionPeriod = 14 * 24 * 60 * 60 * 1000; // 2 weeks

// Update the log file
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

// Enforce HTTPS
app.use((req, res, next) => {
    if (req.secure) {
        const now = new Date();
        const timestamp = now.toISOString();
        const userAgent = req.headers['user-agent'] || 'Unknown';
        const method = req.method;
        const pathUrl = req.path;

        res.on('finish', () => {
            const status = res.statusCode;
            const responseTime = new Date() - now;
            const logEntry = `${timestamp} - ${method} ${pathUrl} - User-Agent: ${userAgent} - Status: ${status} - Response Time: ${responseTime}ms\n`;

            if (debug) {
                console.log(
                    `${timestamp} - ${method} ${pathUrl} - Status: ${status} - Response Time: ${responseTime}ms`
                );
            }

            updateLogFile(logEntry);
        });

        next();
    } else {
        res.redirect(`https://${req.headers.host}${req.url}`);
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Use body-parser middleware with size limits
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

// Import API routes
const toolsRoutes = require('./API/tools');
const apiRoutes = require('./API/api');
const pagesRoutes = require('./API/routes');

// Mount routes
app.use(toolsRoutes);
app.use(apiRoutes);
app.use(pagesRoutes);

// Start HTTPS server
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

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Received SIGINT. Shutting down gracefully...');
    httpsServer.close();
    process.exit(0);
});
