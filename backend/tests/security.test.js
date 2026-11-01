import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import { SessionTokens } from '../lib/session-token.js';
import { sanitizeBody } from '../lib/sanitize.js';
import { createRateLimiter, hostRateLimitCounters } from '../lib/ratelimit.js';
import { calculateAverage, computeRoundRankings, mulberry32, buildDistribution } from '../wca/stats.js';

test('session tokens: valid across instances sharing the secret, rejected when tampered/expired/foreign', () => {
    const a = new SessionTokens({ secret: 's'.repeat(40), ttlMs: 1000 });
    const b = new SessionTokens({ secret: 's'.repeat(40), ttlMs: 1000 }); // "another worker"
    const t = a.issue({ username: 'x', role: 'admin' }, 5000);
    assert.equal(b.verify(t, 5500).username, 'x');
    assert.equal(b.verify(t, 6001), null, 'expired');
    assert.equal(new SessionTokens({ secret: 'z'.repeat(40) }).verify(t, 5500), null, 'foreign secret');
    const [body, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ username: 'x', role: 'admin', exp: 1e15 })).toString('base64url');
    assert.equal(b.verify(`${forged}.${sig}`, 5500), null, 'tampered payload');
    assert.equal(b.verify(body, 5500), null);
    assert.equal(b.verify('', 5500), null);
});

test('body sanitizer strips markup but leaves passwords byte-for-byte', async () => {
    const app = express();
    app.use(express.json());
    app.use(sanitizeBody());
    app.post('/', (req, res) => res.json(req.body));
    const s = http.createServer(app).listen(0);
    const port = s.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'p&ss<word>1', newPassword: 'a&b', message: 'hi <script>alert(1)</script>', nested: { x: '<b>y</b>' }, list: ['<i>z</i>'] }),
    });
    const j = await r.json();
    assert.equal(j.password, 'p&ss<word>1');
    assert.equal(j.newPassword, 'a&b');
    assert.ok(!j.message.includes('<script'));
    assert.equal(j.nested.x, 'y'); // nested fields used to bypass sanitisation
    assert.equal(j.list[0], 'z');
    s.close();
});

test('rate limiting cannot be bypassed with a spoofed Host header', async () => {
    process.env.RATE_LIMIT = 'force';
    hostRateLimitCounters();
    const app = express();
    app.use(createRateLimiter(60_000, 3, 'slow down'));
    app.get('/', (_req, res) => res.send('ok'));
    const s = http.createServer(app).listen(0);
    const port = s.address().port;
    const codes = [];
    for (let i = 0; i < 5; i++) {
        const r = await new Promise((resolve) => http.get({ port, host: '127.0.0.1', headers: { host: 'localhost' } }, (res) => (res.resume(), resolve(res.statusCode))));
        codes.push(r);
    }
    assert.deepEqual(codes, [200, 200, 200, 429, 429]);
    s.close();
});

test('loopback clients are exempt from limits in local development', async () => {
    delete process.env.RATE_LIMIT;
    const app = express();
    app.use(createRateLimiter(60_000, 1, 'slow down'));
    app.get('/', (_req, res) => res.send('ok'));
    const s = http.createServer(app).listen(0);
    const port = s.address().port;
    for (let i = 0; i < 4; i++) assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
    s.close();
});

test('stats: calculateAverage keeps its client-facing contract (null / 0 / mean)', () => {
    assert.equal(calculateAverage([]), null);
    assert.equal(calculateAverage([1000]), 0); // Guildford requires a number here
    assert.equal(calculateAverage([1000, 1100]), 0);
    assert.equal(calculateAverage([900, 1000, 1100, 5000, 800]), 10); // drops 800 and 5000 -> (900+1000+1100)/3
});

test('stats: rankings are deterministic with a seeded RNG and probabilities are coherent', () => {
    const mk = (mean, sd) => ({ name: `m${mean}`, profile: buildDistribution([mean - sd, mean, mean + sd]) });
    const profiles = new Map([['A', mk(8, 0.3)], ['B', mk(10, 0.3)], ['C', mk(12, 0.3)]]);
    const r1 = computeRoundRankings(profiles, { sims: 500, rng: mulberry32(7) });
    const r2 = computeRoundRankings(profiles, { sims: 500, rng: mulberry32(7) });
    assert.deepEqual(r1.map((x) => x.winProbability), r2.map((x) => x.winProbability));
    assert.equal(r1[0].wcaId, 'A');
    assert.ok(r1[0].winProbability > 0.95);
    assert.ok(Math.abs(r1.reduce((a, x) => a + x.winProbability, 0) - 1) < 1e-9);
    assert.ok(r1.every((x) => x.top8Probability === 1)); // only 3 competitors
});
