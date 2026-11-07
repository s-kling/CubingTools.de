import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

export const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT_DIR = path.resolve(BACKEND_DIR, '..');

// Must run before the path constants below read process.env (backend/.env may define them).
dotenv.config({ path: path.join(BACKEND_DIR, '.env') });

// Writable locations can be moved onto volumes (Docker) without touching the code.
export const SECRET_DIR = process.env.SECRET_DIR || path.join(BACKEND_DIR, 'secret');
export const LOG_DIR = process.env.LOG_DIR || path.join(BACKEND_DIR, 'log');
export const BANS_FILE =
    process.env.BANS_FILE || path.join(BACKEND_DIR, 'API', 'mail', 'bans.json');

const DEFAULTS = {
    prod_port: 8000,
    beta_port: 8001,
    dev_port: 8002,
    // The logic server listens on its own ports; the web server proxies /api/* to it
    // (or the reverse proxy routes to it directly, see md/ARCHITECTURE.md).
    logic_prod_port: 8100,
    logic_beta_port: 8101,
    logic_dev_port: 8102,
    log_retention_days: 14,
    body_parser_limit: '1mb',
    error_rate_threshold: 3,
    // 0 = auto (CPU count, capped)
    web_workers: 0,
    logic_workers: 0,
    // Max concurrent proxied API requests per web worker before answering 503.
    proxy_max_inflight: 256,
    proxy_timeout_ms: 30_000,
    // Worker threads used for CPU-heavy tasks inside each logic worker.
    cpu_pool_size: 2,
    newsletter: {
        // Messages dispatched per tick and concurrent SMTP connections.
        batch_size: 200,
        max_connections: 5,
        // Per-connection throttle: messages per second.
        rate_per_second: 5,
        max_attempts: 6,
    },
};

export function loadConfig() {
    let file = {};
    try {
        file = JSON.parse(fs.readFileSync(path.join(BACKEND_DIR, 'config.json'), 'utf8'));
    } catch {
        // config.json is optional now; defaults apply.
    }
    const merged = {
        ...DEFAULTS,
        ...file,
        newsletter: { ...DEFAULTS.newsletter, ...(file.newsletter || {}) },
    };
    // Environment wins over config.json: this is how containers are configured.
    const int = (name) =>
        Number.isInteger(Number(process.env[name])) && process.env[name]
            ? Number(process.env[name])
            : null;
    if (int('WEB_WORKERS') !== null) merged.web_workers = int('WEB_WORKERS');
    if (int('LOGIC_WORKERS') !== null) merged.logic_workers = int('LOGIC_WORKERS');
    return merged;
}

export function parseArgs(argv = process.argv) {
    return { beta: argv.includes('--beta'), debug: argv.includes('--debug') };
}

export function resolveWorkerCount(configured, cap = 8) {
    const n = Number(configured);
    if (Number.isInteger(n) && n > 0) return n;
    const cpus = (globalThis.process && Number(process.env.WEB_CONCURRENCY)) || 0;
    if (cpus > 0) return cpus;
    return Math.max(1, Math.min(cap, Math.floor(availableCpus() / 2) || 1));
}

function availableCpus() {
    try {
        return typeof process.availableParallelism === 'function'
            ? process.availableParallelism()
            : 2;
    } catch {
        return 2;
    }
}

export function portsFor(config, { beta, debug }) {
    const ports = debug
        ? { web: config.dev_port, logic: config.logic_dev_port }
        : beta
          ? { web: config.beta_port, logic: config.logic_beta_port }
          : { web: config.prod_port, logic: config.logic_prod_port };
    // PORT / LOGIC_PORT override config.json (containers publish fixed ports).
    if (Number(process.env.PORT) > 0) ports.web = Number(process.env.PORT);
    if (Number(process.env.LOGIC_PORT) > 0) ports.logic = Number(process.env.LOGIC_PORT);
    return ports;
}
