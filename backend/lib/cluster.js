import cluster from 'cluster';

/**
 * Tiny supervisor + RPC layer on top of node:cluster (no extra dependency).
 *
 *  - runCluster() forks N workers, respawns crashed ones with exponential backoff,
 *    and drains them on SIGTERM/SIGINT.
 *  - registerHandler()/rpc() let workers call singletons that live in the primary
 *    (shared rate-limit counters, the single log writer). With workers <= 1 or
 *    when not forked, rpc() simply calls the handler in-process, so the same code
 *    path works in tests and in `--debug` mode.
 */

const handlers = new Map();
const pending = new Map();
let seq = 0;

export function registerHandler(type, fn) {
    handlers.set(type, fn);
}

export function rpc(type, payload, { timeoutMs = 2000 } = {}) {
    if (!cluster.isWorker || !process.send) {
        const fn = handlers.get(type);
        return Promise.resolve(fn ? fn(payload) : undefined);
    }
    return new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`rpc ${type} timed out`));
        }, timeoutMs);
        timer.unref();
        pending.set(id, { resolve, reject, timer });
        process.send({ __ct: 'req', id, type, payload });
    });
}

/** Fire-and-forget message to the primary (used for log lines). */
export function notify(type, payload) {
    if (!cluster.isWorker || !process.send) {
        const fn = handlers.get(type);
        if (fn) fn(payload);
        return;
    }
    process.send({ __ct: 'note', type, payload });
}

if (cluster.isWorker) {
    process.on('message', (m) => {
        if (m?.__ct !== 'res') return;
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        clearTimeout(p.timer);
        m.error ? p.reject(new Error(m.error)) : p.resolve(m.result);
    });
}

function onWorkerMessage(worker, m) {
    if (!m || typeof m !== 'object') return;
    const fn = handlers.get(m.type);
    if (m.__ct === 'note') {
        try {
            fn?.(m.payload, worker);
        } catch (e) {
            console.error('[cluster] note handler failed:', e.message);
        }
    } else if (m.__ct === 'req') {
        Promise.resolve()
            .then(() => {
                if (!fn) throw new Error(`no handler for ${m.type}`);
                return fn(m.payload, worker);
            })
            .then(
                (result) => worker.isConnected() && worker.send({ __ct: 'res', id: m.id, result }),
                (err) =>
                    worker.isConnected() &&
                    worker.send({ __ct: 'res', id: m.id, error: String(err.message || err) }),
            );
    }
}

/**
 * @param {object} o
 * @param {string} o.name           label used in logs
 * @param {number} o.workers        0/1 = run everything in this process
 * @param {Function} [o.primary]    runs once in the primary (or in-process); may return a stop() fn
 * @param {Function} o.worker       runs in every worker (or in-process); may return a stop() fn
 */
export async function runCluster({ name, workers, primary, worker }) {
    if (workers <= 1) {
        const stops = [];
        if (primary) stops.push(await primary());
        stops.push(await worker());
        return async () => {
            for (const s of stops.reverse()) await s?.();
        };
    }

    if (cluster.isWorker) {
        return worker();
    }

    const stopPrimary = primary ? await primary() : null;
    const state = new Map(); // worker.id -> { startedAt }
    let backoffMs = 500;
    let shuttingDown = false;

    const spawn = () => {
        const w = cluster.fork();
        state.set(w.id, { startedAt: Date.now() });
        w.on('message', (m) => onWorkerMessage(w, m));
    };

    cluster.on('exit', (w, code, signal) => {
        const info = state.get(w.id);
        state.delete(w.id);
        if (shuttingDown) return;
        const lived = info ? Date.now() - info.startedAt : 0;
        backoffMs = lived > 60_000 ? 500 : Math.min(backoffMs * 2, 30_000);
        console.error(
            `[${name}] worker ${w.process.pid} exited (code=${code}, signal=${signal}); respawn in ${backoffMs}ms`,
        );
        setTimeout(spawn, backoffMs).unref?.();
    });

    for (let i = 0; i < workers; i++) spawn();
    console.log(`[${name}] primary ${process.pid} supervising ${workers} workers`);

    const stop = async () => {
        shuttingDown = true;
        const exits = [];
        for (const w of Object.values(cluster.workers)) {
            exits.push(new Promise((r) => w.once('exit', r)));
            w.process.kill('SIGTERM');
        }
        await Promise.race([Promise.all(exits), new Promise((r) => setTimeout(r, 10_000))]);
        await stopPrimary?.();
    };
    for (const sig of ['SIGTERM', 'SIGINT']) {
        process.once(sig, () => stop().finally(() => process.exit(0)));
    }
    return stop;
}

export const isClusterWorker = () => cluster.isWorker;
