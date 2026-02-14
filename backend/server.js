const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const app = express();
const prodPort = config.prod_port;
const betaPort = config.beta_port;
const betaTest = process.argv.includes('--beta');
const debug = process.argv.includes('--debug');

/* =========================
   Logging
========================= */

const logDir = path.join(__dirname, 'log');
const logFilePath = betaTest ? path.join(logDir, 'beta.log') : path.join(logDir, 'server.log');

if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

function logRequest(req, res, startTime) {
    const entry = {
        time: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - startTime,
        userAgent: req.headers['user-agent'] || null,
    };

    const line = JSON.stringify(entry) + '\n';

    if (debug) console.log(line.trim());
    logStream.write(line);
}

/* =========================
   Middleware
========================= */

app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        logRequest(req, res, start);
    });

    next();
});

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json({ limit: config.body_parser_limit }));
app.use(express.urlencoded({ extended: true, limit: config.body_parser_limit }));

/* =========================
   Routes
========================= */

app.use(require('./API/tools'));
app.use(require('./API/api'));
app.use(require('./API/routes'));

/* =========================
   Server
========================= */

const port = betaTest ? betaPort : prodPort;
const server = http.createServer(app);

server.listen(port, () => {
    console.log(`Listening on port ${port}`);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT. Shutting down gracefully...');
    server.close(() => {
        logStream.end();
        process.exit(0);
    });
});
