/**
 * Logic (API) server: everything that talks to Firestore, SQLite, the WCA, SMTP or does CPU work.
 * It scales horizontally with node:cluster; the web server (page serving) never runs this code,
 * so a slow or overloaded API cannot delay HTML/CSS/JS delivery.
 */
import express from 'express';
import http from 'http';
import { pathToFileURL } from 'url';
import { loadConfig, parseArgs, portsFor, resolveWorkerCount } from '../lib/config.js';
import { runCluster } from '../lib/cluster.js';
import { RequestLogger, logFilePath, installFatalHandlers } from '../lib/logger.js';
import { hostRateLimitCounters } from '../lib/ratelimit.js';
import { corsMiddleware } from '../lib/cors.js';
import { sanitizeBody } from '../lib/sanitize.js';
import { loadSessionSecret } from '../lib/session-token.js';

export async function createLogicApp({ config, logger = null }) {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', 1);

    if (logger) app.use(logger.middleware());
    app.use(corsMiddleware());
    app.use(express.json({ limit: config.body_parser_limit }));
    app.use(express.urlencoded({ extended: true, limit: config.body_parser_limit }));
    app.use(sanitizeBody());

    // Imported lazily so the cluster primary never initialises Firebase / worker threads.
    const { default: apiRouter, cpuPool, wcaStore } = await import('../API/api.js');
    const { default: newsletterRouter } = await import('../API/newsletter-routes.js');

    app.get('/api/health', (_req, res) =>
        res.json({ ok: true, wcaReady: wcaStore.isReady(), pool: cpuPool.stats(), pid: process.pid }),
    );
    app.use(apiRouter);
    app.use(newsletterRouter);
    app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

    // eslint-disable-next-line no-unused-vars
    app.use((err, _req, res, _next) => {
        // body-parser errors carry a 4xx status; anything else is ours.
        const status = err.status >= 400 && err.status < 500 ? err.status : 500;
        if (status === 500) console.error('[logic] unhandled error:', err.stack || err.message);
        if (!res.headersSent) res.status(status).json({ error: status === 500 ? 'Internal Server Error' : err.message });
    });

    return { app, close: () => cpuPool.close() };
}

export async function startLogic() {
    const args = parseArgs();
    const config = loadConfig();
    const ports = portsFor(config, args);
    const role = 'logic';
    const workers = args.debug ? 1 : resolveWorkerCount(config.logic_workers);
    let server;
    let logger;
    let closeApp;

    installFatalHandlers(role, async () => {
        await new Promise((r) => (server ? server.close(r) : r()));
        await closeApp?.();
    });

    return runCluster({
        name: role,
        workers,
        primary: async () => {
            loadSessionSecret(); // create the key once, before any worker needs it
            const stopCounters = hostRateLimitCounters();
            logger = new RequestLogger({ file: logFilePath({ beta: args.beta, role }), retentionDays: config.log_retention_days, debug: args.debug });
            const t = setInterval(() => logger.prune().catch((e) => console.error('[logic] log prune failed:', e.message)), 24 * 60 * 60 * 1000);
            t.unref();
            return async () => {
                stopCounters();
                clearInterval(t);
                await logger.close();
            };
        },
        worker: async () => {
            logger ??= new RequestLogger({ file: logFilePath({ beta: args.beta, role }), retentionDays: config.log_retention_days, debug: args.debug });
            const { app, close } = await createLogicApp({ config, logger });
            closeApp = close;
            server = http.createServer(app);
            server.keepAliveTimeout = 65_000;
            server.headersTimeout = 66_000;
            await new Promise((r) => server.listen(ports.logic, process.env.LOGIC_HOST || '127.0.0.1', r));
            console.log(`[logic] pid ${process.pid} listening on :${ports.logic}`);
            return async () => {
                await new Promise((r) => server.close(r));
                await close();
            };
        },
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startLogic();
}
