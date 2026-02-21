const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const sanitizeHtml = require('sanitize-html');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const app = express();
const prodPort = config.prod_port;
let betaPort = config.beta_port;
let betaTest = process.argv.includes('--beta');
const debug = process.argv.includes('--debug');

const ansi = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
};

function colorize(color, value) {
    return `${ansi[color] || ''}${value}${ansi.reset}`;
}

function getStatusColor(statusCode) {
    if (statusCode >= 500) {
        return 'red';
    }
    if (statusCode >= 400) {
        return 'yellow';
    }
    if (statusCode >= 300) {
        return 'cyan';
    }
    return 'green';
}

function formatDuration(durationMs) {
    if (durationMs < 1000) {
        return `${durationMs}ms`;
    }
    return `${(durationMs / 1000).toFixed(2)}s`;
}

function debugLog(message) {
    if (!debug) {
        return;
    }
    const timestamp = new Date().toISOString();
    console.log(`${colorize('magenta', '[debug]')} ${colorize('dim', timestamp)} ${message}`);
}

if (debug) {
    console.log(colorize('magenta', '[debug] Debug mode enabled'));
    betaTest = true;
    betaPort = config.dev_port;
}

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
    const durationMs = Date.now() - startTime;
    const entry = {
        time: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs,
        userAgent: req.headers['user-agent'] || null,
    };

    const line = JSON.stringify(entry) + '\n';

    logStream.write(line);

    if (debug) {
        const statusColor = getStatusColor(res.statusCode);
        const method = colorize('cyan', req.method.padEnd(6));
        const status = colorize(statusColor, String(res.statusCode));
        const duration = colorize('yellow', formatDuration(durationMs));
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
        const ua = req.headers['user-agent'] || 'unknown-agent';
        const responseSize = res.getHeader('content-length') || '-';

        console.log(
            `${method} ${req.originalUrl} ${status} ${duration} ${colorize('dim', `ip=${ip} bytes=${responseSize}`)}`,
        );
        console.log(`${colorize('dim', `      ua=${ua}`)}`);
    }
}

/* =========================
   Middleware
========================= */

app.use((req, res, next) => {
    const start = Date.now();

    if (debug) {
        const queryKeys = req.query && typeof req.query === 'object' ? Object.keys(req.query) : [];
        const hasBody =
            req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0;
        const bodyKeys = hasBody ? Object.keys(req.body) : [];
        debugLog(
            `${colorize('cyan', '→')} ${req.method} ${req.originalUrl} ${colorize('dim', `queryKeys=${queryKeys.length ? queryKeys.join(',') : '-'} bodyKeys=${bodyKeys.length ? bodyKeys.join(',') : '-'}`)}`,
        );
    }

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

app.use((req, res, next) => {
    if (req.body && typeof req.body === 'object') {
        Object.keys(req.body).forEach((key) => {
            if (typeof req.body[key] === 'string') {
                req.body[key] = sanitizeHtml(req.body[key], { allowedTags: [] });
            }
        });
    }
    next();
});

app.use(require('./API/tools'));
app.use(require('./API/api'));
app.use(require('./API/routes'));

/* =========================
   Server
========================= */

const port = betaTest ? betaPort : prodPort;
const server = http.createServer(app);

debugLog(`node=${process.version} pid=${process.pid} cwd=${process.cwd()}`);
debugLog(`mode=${betaTest ? 'beta' : 'prod'} logFile=${logFilePath}`);
debugLog(`bodyParserLimit=${config.body_parser_limit}`);

server.listen(port, () => {
    console.log(`Listening on port ${port}`);
    debugLog(`server=http://localhost:${port}`);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT. Shutting down gracefully...');
    debugLog('closing HTTP server and log stream');
    server.close(() => {
        logStream.end();
        process.exit(0);
    });
});

process.on('uncaughtException', (error) => {
    console.error(colorize('red', '[fatal] uncaughtException'), error);
});

process.on('unhandledRejection', (reason) => {
    console.error(colorize('red', '[fatal] unhandledRejection'), reason);
});
