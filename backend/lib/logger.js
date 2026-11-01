import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { BACKEND_DIR } from './config.js';
import { notify, registerHandler, isClusterWorker } from './cluster.js';

const ansi = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
};
const color = (c, v) => `${ansi[c] || ''}${v}${ansi.reset}`;

export function logFilePath({ beta, role }) {
    // Keep the historical names for the web log so the status dashboard keeps working.
    const base = beta ? 'beta' : 'server';
    return path.join(BACKEND_DIR, 'log', role === 'web' ? `${base}.log` : `${base}.${role}.log`);
}

/**
 * Append-only JSON-lines request logger.
 *
 * Fixes vs. the previous implementation in server.js:
 *  - never replaces the stream while writes may still be in flight (the old daily
 *    `logStream.end()` + re-create window could raise "write after end" and, because
 *    the fatal handlers were silent, go unnoticed);
 *  - retention is done by an async, streaming rewrite instead of readFileSync of
 *    the whole file on the event loop;
 *  - multiple cluster workers can append to the same file (O_APPEND writes of one
 *    line are atomic for small lines), only the primary runs retention.
 */
export class RequestLogger {
    /**
     * In a cluster worker the logger forwards lines to the primary over IPC so there is
     * exactly one writer per file (safe pruning, no interleaved partial lines).
     * Everywhere else (single process, tests, the primary itself) it writes directly.
     */
    constructor({ file, retentionDays = 14, debug = false, channel = 'log' }) {
        this.file = file;
        this.retentionMs = retentionDays * 24 * 60 * 60 * 1000;
        this.debug = debug;
        this.channel = `${channel}:${path.basename(file)}`;
        this.remote = isClusterWorker();
        this.stream = null;
        if (!this.remote) {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            this._open();
            registerHandler(this.channel, (line) => this.stream?.write(line));
        }
    }

    _open() {
        this.stream = fs.createWriteStream(this.file, { flags: 'a' });
        this.stream.on('error', (err) => {
            console.error('[log] stream error:', err.message);
            // Re-open on next tick; losing a few log lines beats crashing the worker.
            setTimeout(() => this._open(), 1000).unref();
        });
    }

    middleware() {
        return (req, res, next) => {
            const start = process.hrtime.bigint();
            res.on('finish', () => {
                const durationMs = Number((process.hrtime.bigint() - start) / 1_000_000n);
                this.write(req, res, durationMs);
            });
            next();
        };
    }

    write(req, res, durationMs) {
        const entry = {
            time: new Date().toISOString(),
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            durationMs,
            userAgent: req.headers['user-agent'] || null,
        };
        if (req.query?.utm_source) entry.utmSource = req.query.utm_source;
        const line = JSON.stringify(entry) + '\n';
        if (this.remote) notify(this.channel, line);
        else this.stream.write(line);

        if (this.debug) {
            const c = res.statusCode >= 500 ? 'red' : res.statusCode >= 400 ? 'yellow' : 'green';
            console.log(
                `${color('cyan', req.method.padEnd(6))} ${req.originalUrl} ${color(c, res.statusCode)} ${color('yellow', durationMs + 'ms')}`,
            );
        }
    }

    /**
     * Drop entries older than the retention window without blocking the event loop.
     * Lines appended while the rewrite runs are copied over from the byte offset where
     * the scan stopped, so only a sub-millisecond window around the rename can lose lines.
     */
    async prune() {
        if (!fs.existsSync(this.file)) return { removed: 0, kept: 0 };
        const cutoff = Date.now() - this.retentionMs;
        const tmp = `${this.file}.prune`;
        const out = fs.createWriteStream(tmp);
        const input = fs.createReadStream(this.file);
        let kept = 0;
        let removed = 0;
        const rl = readline.createInterface({ input, crlfDelay: Infinity });
        for await (const line of rl) {
            if (!line) continue;
            let keep = true;
            try {
                keep = new Date(JSON.parse(line).time).getTime() >= cutoff;
            } catch {
                /* keep unparsable lines */
            }
            if (!keep) {
                removed++;
                continue;
            }
            kept++;
            if (!out.write(line + '\n')) await new Promise((r) => out.once('drain', r));
        }
        if (removed === 0) {
            await new Promise((r) => out.end(r));
            await fsp.unlink(tmp).catch(() => {});
            return { removed, kept };
        }
        // Copy anything appended after the scan finished.
        const handle = await fsp.open(this.file, 'r');
        try {
            const { size } = await handle.stat();
            if (size > input.bytesRead) {
                const tail = Buffer.alloc(size - input.bytesRead);
                await handle.read(tail, 0, tail.length, input.bytesRead);
                out.write(tail);
            }
        } finally {
            await handle.close();
        }
        await new Promise((r) => out.end(r));
        await fsp.rename(tmp, this.file);
        // Writers still hold the old inode; reopen so they append to the new file.
        const old = this.stream;
        this._open();
        old.end();
        return { removed, kept };
    }

    close() {
        if (!this.stream) return Promise.resolve();
        return new Promise((r) => this.stream.end(r));
    }
}

export function debugLogger(enabled) {
    return (msg) => {
        if (enabled) console.log(`${color('magenta', '[debug]')} ${color('dim', new Date().toISOString())} ${msg}`);
    };
}

/**
 * Fatal-error policy: log loudly (always, not only in debug mode) and exit so the
 * supervisor restarts a clean process. The old code logged through debugLog() with
 * two arguments, which printed nothing in production and then kept running in an
 * undefined state.
 */
export function installFatalHandlers(name, onShutdown = async () => {}) {
    let exiting = false;
    const die = async (code, label, err) => {
        console.error(`[${name}] ${label}:`, err?.stack || err);
        if (exiting) return;
        exiting = true;
        const t = setTimeout(() => process.exit(code), 5000);
        t.unref();
        try {
            await onShutdown();
        } finally {
            process.exit(code);
        }
    };
    process.on('uncaughtException', (e) => die(1, 'uncaughtException', e));
    process.on('unhandledRejection', (e) => die(1, 'unhandledRejection', e));
    const graceful = (sig) => async () => {
        console.log(`[${name}] ${sig} received, shutting down`);
        await die(0, `shutdown (${sig})`, null);
    };
    process.on('SIGTERM', graceful('SIGTERM'));
    process.on('SIGINT', graceful('SIGINT'));
}
