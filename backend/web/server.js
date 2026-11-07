/**
 * Web (page-serving) server.
 *
 * Serves HTML/CSS/JS/assets and a few tiny cached JSON endpoints. It deliberately has
 * NO dependency on Firebase, SQLite, WCA data, mail or bcrypt: nothing here can block on
 * slow work. Every dynamic endpoint is forwarded to the logic server through a bounded,
 * streaming proxy (lib/proxy.js), so a slow API request can never starve page delivery.
 *
 * If your reverse proxy already routes /api/* to the logic server, the proxy below is
 * simply never hit (see md/ARCHITECTURE.md).
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { pathToFileURL } from 'url';
import compression from 'compression';
import { loadConfig, parseArgs, portsFor, resolveWorkerCount, ROOT_DIR } from '../lib/config.js';
import { runCluster } from '../lib/cluster.js';
import { RequestLogger, logFilePath, installFatalHandlers } from '../lib/logger.js';
import { createApiProxy } from '../lib/proxy.js';
import { corsMiddleware } from '../lib/cors.js';
import events from '../events.js';

const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const TOOLS_DIR = path.join(PUBLIC_DIR, 'tools');
const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const PSEUDO_NAMES = { guildford: ['relay', 'optimizer', 'relay-optimizer'], grouping: ['groupifier'] };

// Paths that need the logic server (database, WCA data, mail ...).
export const LOGIC_PATHS = ['/api', '/contact/confirm', '/newsletter'];

export function resolvePathSafe(base, ...segments) {
    const resolvedBase = path.resolve(base);
    const target = path.resolve(base, ...segments);
    if (target !== resolvedBase && !target.startsWith(resolvedBase + path.sep)) return null;
    return target;
}

/** Cache of tool metadata keyed by file mtime, so /api/tools never re-reads HTML per request. */
export function createToolsIndex(toolsDir = TOOLS_DIR) {
    const cache = new Map(); // folder -> { mtimeMs, meta }

    function extract(filePath) {
        const html = fs.readFileSync(filePath, 'utf-8');
        const grab = (re) => (html.match(re) || [])[1];
        const description = grab(/<meta name="description" content="(.*?)">/) || 'No description';
        const keywords = (grab(/<meta name="keywords" content="(.*?)">/) || '')
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean);
        return {
            title: grab(/<title>(.*?)<\/title>/) || 'No title',
            description,
            slogan: grab(/<meta name="slogan" content="(.*?)">/) || description,
            // The first 9 keywords are shared generic ones.
            keywords: keywords.slice(9),
        };
    }

    return async function list() {
        const entries = await fs.promises.readdir(toolsDir, { withFileTypes: true });
        const out = [];
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const file = path.join(toolsDir, entry.name, `${entry.name}.html`);
            let stat;
            try {
                stat = await fs.promises.stat(file);
            } catch {
                out.push({ filename: entry.name, title: 'No title', description: 'No description', slogan: 'No description', keywords: [] });
                continue;
            }
            let hit = cache.get(entry.name);
            if (!hit || hit.mtimeMs !== stat.mtimeMs) {
                hit = { mtimeMs: stat.mtimeMs, meta: extract(file) };
                cache.set(entry.name, hit);
            }
            out.push({ filename: entry.name, ...hit.meta });
        }
        return out;
    };
}

export function createWebApp({ config, logger = null, logicUrl = null, publicDir = PUBLIC_DIR } = {}) {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', 1);

    if (logger) app.use(logger.middleware());

    app.use(corsMiddleware());

    // Liveness for Docker / load balancers: depends on nothing but this process.
    app.get('/healthz', (_req, res) => res.json({ ok: true, role: 'web', pid: process.pid }));

    // Tiny local endpoints (must be registered before the /api proxy mount below).
    const toolsIndex = createToolsIndex();
    let toolsCache = { at: 0, data: null };
    app.get('/api/tools', async (_req, res) => {
        try {
            if (!toolsCache.data || Date.now() - toolsCache.at > 30_000) {
                toolsCache = { at: Date.now(), data: await toolsIndex() };
            }
            res.setHeader('Cache-Control', 'public, max-age=60');
            res.json(toolsCache.data);
        } catch {
            res.status(500).json({ error: 'Unable to scan directory' });
        }
    });
    app.get('/events', (_req, res) => {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.json({ events });
    });

    // Dynamic traffic is proxied before any body parsing so bodies stream through untouched.
    if (logicUrl) {
        const proxy = createApiProxy({
            target: logicUrl,
            maxInflight: config.proxy_max_inflight,
            timeoutMs: config.proxy_timeout_ms,
        });
        app.get('/web-health', (_req, res) => res.json({ ok: true, proxy: proxy.stats() }));
        for (const p of LOGIC_PATHS) app.use(p, (req, res) => proxy(req, res));
    }

    // Compression comes after the proxy mount so streamed NDJSON is never buffered by it.
    app.use(compression());

    // Static assets with conditional requests; HTML stays revalidated.
    app.use(
        express.static(publicDir, {
            etag: true,
            maxAge: '1h',
            setHeaders: (res, file) => {
                if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
            },
        }),
    );

    // Reject malformed percent-encoding early.
    app.use((req, res, next) => {
        try {
            decodeURIComponent(req.path);
            next();
        } catch {
            res.status(400).send('Bad Request');
        }
    });

    const page = (...segs) => (_req, res) => res.sendFile(path.join(publicDir, ...segs));
    app.get('/', page('html', 'index.html'));
    for (const r of ['/privacy-policy', '/privacy']) app.get(r, page('html', 'privacy.html'));
    for (const r of ['/contact', '/contact/appeal']) app.get(r, page('html', 'contact.html'));
    app.get('/robots.txt', page('robots.txt'));
    app.get('/sitemap.xml', page('sitemap.xml'));
    app.get('/404', page('html', '404.html'));
    app.get('/googlea20166777fc211f6.html', page('html', 'google.html'));
    for (const r of ['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png'])
        app.get(r, page('assets', 'logo_with_text.png'));
    app.get('/favicon.ico', page('assets', 'favicon.ico'));
    app.get('/.well-known/*', (_req, res) => res.status(204).end());

    for (const [route, file] of Object.entries({
        '/admin': 'admin.html',
        '/admin/status': 'status.html',
        '/admin/messages': 'messages.html',
        '/admin/dev-todo': 'dev-todo.html',
        '/admin/users': 'users.html',
    })) {
        app.get(route, page('html', 'admin', file));
    }

    app.get('/tools/:toolName', (req, res) => {
        const { toolName } = req.params;
        if (!SAFE_NAME_RE.test(toolName)) return res.status(400).send('Bad Request');
        let real = toolName;
        for (const [name, aliases] of Object.entries(PSEUDO_NAMES)) {
            if (aliases.includes(toolName)) real = name;
        }
        const file = resolvePathSafe(path.join(publicDir, 'tools'), real, `${real}.html`);
        if (!file) return res.status(400).send('Bad Request');
        res.sendFile(file, (err) => err && res.redirect(`/404?dir=${encodeURIComponent(toolName)}`));
    });

    const toolAsset = (prefix, ext) =>
        app.get(`${prefix}/:name`, (req, res) => {
            const { name } = req.params;
            if (!SAFE_NAME_RE.test(name)) return res.status(400).send('Bad Request');
            const file = resolvePathSafe(
                path.join(publicDir, 'tools'),
                name,
                ext === null ? name : `${name}.${ext}`,
            );
            if (!file) return res.status(400).send('Bad Request');
            res.sendFile(file, (err) => err && res.redirect(`/404?dir=${encodeURIComponent(name)}`));
        });
    toolAsset('/css', 'css');
    toolAsset('/js', 'js');
    toolAsset('/assets', null);

    app.get('*', (_req, res) => {
        res.status(404);
        res.sendFile(path.join(publicDir, 'html', '404.html'), () => {});
    });

    // Last-resort error handler: never leak stack traces, never hang the socket.
    // eslint-disable-next-line no-unused-vars
    app.use((err, _req, res, _next) => {
        console.error('[web] unhandled error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Internal Server Error' });
    });
    return app;
}

export async function startWeb() {
    const args = parseArgs();
    const config = loadConfig();
    const ports = portsFor(config, args);
    const role = 'web';
    const logicUrl = process.env.LOGIC_URL || `http://127.0.0.1:${ports.logic}`;
    const workers = args.debug ? 1 : resolveWorkerCount(config.web_workers);
    let logger;
    let server;

    installFatalHandlers(role, async () => {
        await new Promise((r) => (server ? server.close(r) : r()));
        await logger?.close();
    });

    return runCluster({
        name: role,
        workers,
        primary: async () => {
            logger = new RequestLogger({
                file: logFilePath({ beta: args.beta, role }),
                retentionDays: config.log_retention_days,
                debug: args.debug,
            });
            const prune = () => logger.prune().catch((e) => console.error('[web] log prune failed:', e.message));
            prune();
            const t = setInterval(prune, 24 * 60 * 60 * 1000);
            t.unref();
            return async () => {
                clearInterval(t);
                await logger.close();
            };
        },
        worker: async () => {
            // In a forked worker the logger forwards lines to the primary; in single-process
            // mode the primary() above already created the direct logger.
            logger ??= new RequestLogger({
                file: logFilePath({ beta: args.beta, role }),
                retentionDays: config.log_retention_days,
                debug: args.debug,
            });
            const app = createWebApp({ config, logger, logicUrl });
            server = http.createServer(app);
            // Keep-alive friendly timeouts for browsers and a fronting proxy.
            server.keepAliveTimeout = 65_000;
            server.headersTimeout = 66_000;
            await new Promise((r) => server.listen(ports.web, r));
            console.log(`[web] pid ${process.pid} listening on :${ports.web} -> logic ${logicUrl}`);
            return () => new Promise((r) => server.close(r));
        },
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startWeb();
}
