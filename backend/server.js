const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const bodyParser = require('body-parser');

const app = express();
const httpsPort = 443;
const betaPort = 8080;
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

// === Middleware ===
if (!betaTest) {
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
}

// === Routes ===
app.use(express.static(path.join(__dirname, '../public')));
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

const toolsRoutes = require('./API/tools');
const apiRoutes = require('./API/api');
const pagesRoutes = require('./API/routes');
app.use(toolsRoutes);
app.use(apiRoutes);
app.use(pagesRoutes);

// === Start Server ===r
if (betaTest) {
    const httpServer = http.createServer(app);
    httpServer.listen(betaPort, () => {
        console.log(`Listening for http:// on port ${betaPort}`);
    });

    process.on('SIGINT', () => {
        console.log('Received SIGINT. Shutting down gracefully...');
        httpServer.close();
        process.exit(0);
    });
} else {
    const httpsServer = https.createServer(credentials, app);
    httpsServer.listen(httpsPort, () => {
        console.log('Listening for https://');
    });

    process.on('SIGINT', () => {
        console.log('Received SIGINT. Shutting down gracefully...');
        httpsServer.close();
        process.exit(0);
    });
}
