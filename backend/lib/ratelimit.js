import rateLimit from 'express-rate-limit';
import { registerHandler, rpc } from './cluster.js';

/**
 * Store whose counters live in the cluster primary so every worker enforces the same
 * window. Without it, N workers would silently multiply every limit by N.
 * With workers <= 1 rpc() resolves in-process, so this is also fine standalone.
 */
export class SharedStore {
    constructor() {
        this.localKeys = true;
    }
    init(options) {
        this.windowMs = options.windowMs;
        this.prefix = '';
    }
    async increment(key) {
        try {
            const r = await rpc('rl:incr', { key: this.prefix + key, windowMs: this.windowMs });
            if (r && Number.isFinite(r.totalHits)) return { totalHits: r.totalHits, resetTime: new Date(r.resetTime) };
        } catch (err) {
            if (!this._warned) console.error('[ratelimit] counter host unavailable, failing open:', err.message);
            this._warned = true;
        }
        // Fail open: a broken counter service must never take the API down.
        return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
    }
    async decrement(key) {
        await rpc('rl:decr', { key: this.prefix + key }).catch(() => {});
    }
    async resetKey(key) {
        await rpc('rl:reset', { key: this.prefix + key }).catch(() => {});
    }
}

/** Call once in the cluster primary (or in-process) to host the counters. */
export function hostRateLimitCounters() {
    const hits = new Map(); // key -> { n, resetTime }
    const sweep = setInterval(() => {
        const now = Date.now();
        for (const [k, v] of hits) if (v.resetTime <= now) hits.delete(k);
    }, 60_000);
    sweep.unref();

    registerHandler('rl:incr', ({ key, windowMs }) => {
        const now = Date.now();
        let e = hits.get(key);
        if (!e || e.resetTime <= now) {
            e = { n: 0, resetTime: now + windowMs };
            hits.set(key, e);
        }
        e.n++;
        return { totalHits: e.n, resetTime: e.resetTime };
    });
    registerHandler('rl:decr', ({ key }) => {
        const e = hits.get(key);
        if (e && e.n > 0) e.n--;
    });
    registerHandler('rl:reset', ({ key }) => {
        hits.delete(key);
    });
    return () => clearInterval(sweep);
}

let counter = 0;

const isLoopback = (ip) => ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1';

/**
 * Factory for endpoint-specific limiters.
 *
 * Security fix: the previous version disabled limiting whenever the *client-supplied*
 * Host header did not contain "cubingtools.de", so `curl -H 'Host: x'` bypassed every
 * limiter. Whether limiting is active is now decided by server-side config only
 * (`RATE_LIMIT=off` disables entirely; loopback client IPs are exempt).
 */
export function createRateLimiter(windowMs, limit, message, options = {}) {
    if (process.env.RATE_LIMIT === 'off') return (_req, _res, next) => next();
    // Local development: requests whose *client IP* is loopback are not limited. req.ip comes from the
    // socket (or from X-Forwarded-For set by our own proxy tier), never from the client-controlled Host
    // header. RATE_LIMIT=force applies limits to loopback too (used by tests).
    const exemptLoopback = process.env.RATE_LIMIT !== 'force';
    const store = new SharedStore();
    store.prefix = `${++counter}:`;
    return rateLimit({
        windowMs,
        limit,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: message },
        store,
        skip: (req) => exemptLoopback && isLoopback(req.ip),
        ...options,
    });
}
