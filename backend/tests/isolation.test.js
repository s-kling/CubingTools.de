import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import { createWebApp } from '../web/server.js';
import { loadConfig } from '../lib/config.js';

const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const base = { ...loadConfig(), proxy_max_inflight: 20, proxy_timeout_ms: 400 };

async function rig(upstreamApp, cfg = base) {
    const up = http.createServer(upstreamApp);
    const upPort = await listen(up);
    const web = http.createServer(createWebApp({ config: cfg, logicUrl: `http://127.0.0.1:${upPort}` }));
    const webPort = await listen(web);
    return { webPort, close: () => (up.closeAllConnections(), web.closeAllConnections(), up.close(), web.close()) };
}

test('slow API requests do not delay page serving', async () => {
    const up = express();
    up.get('/api/slow', (_req, _res) => {}); // never answers
    const { webPort, close } = await rig(up, { ...base, proxy_max_inflight: 500, proxy_timeout_ms: 60_000 });
    // 200 hung API calls in flight...
    const hung = Array.from({ length: 200 }, () => fetch(`http://127.0.0.1:${webPort}/api/slow`).catch(() => {}));
    await new Promise((r) => setTimeout(r, 150));
    // ...pages are still instant.
    const t = [];
    for (let i = 0; i < 30; i++) {
        const s = performance.now();
        const r = await fetch(`http://127.0.0.1:${webPort}/`);
        assert.equal(r.status, 200);
        await r.text();
        t.push(performance.now() - s);
    }
    t.sort((a, b) => a - b);
    assert.ok(t[Math.floor(t.length * 0.95)] < 250, `p95 page latency was ${t[28].toFixed(0)}ms`);
    close();
    await Promise.allSettled(hung);
});

test('proxy sheds load with 503 instead of queueing without bound', async () => {
    const up = express();
    up.get('/api/slow', () => {});
    const { webPort, close } = await rig(up, { ...base, proxy_max_inflight: 5, proxy_timeout_ms: 60_000 });
    const calls = Array.from({ length: 12 }, () => fetch(`http://127.0.0.1:${webPort}/api/slow`, { signal: AbortSignal.timeout(500) }).then((r) => r.status, () => 'hung'));
    const out = await Promise.all(calls);
    assert.equal(out.filter((s) => s === 503).length, 7);
    assert.equal(out.filter((s) => s === 'hung').length, 5);
    close();
});

test('unresponsive upstream gives 504, dead upstream gives 502', async () => {
    const up = express();
    up.get('/api/slow', () => {});
    const r1 = await rig(up);
    assert.equal((await fetch(`http://127.0.0.1:${r1.webPort}/api/slow`)).status, 504);
    r1.close();
    const web = http.createServer(createWebApp({ config: base, logicUrl: 'http://127.0.0.1:1' }));
    const p = await listen(web);
    assert.equal((await fetch(`http://127.0.0.1:${p}/api/x`)).status, 502);
    web.closeAllConnections();
    web.close();
});

test('NDJSON streams pass through the proxy incrementally and the client IP is forwarded', async () => {
    const up = express();
    up.get('/api/stream', (req, res) => {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.write(JSON.stringify({ n: 1, ip: req.headers['x-forwarded-for'] }) + '\n');
        setTimeout(() => (res.write('{"n":2}\n'), res.end()), 600); // longer than proxy_timeout_ms
    });
    const { webPort, close } = await rig(up);
    const res = await fetch(`http://127.0.0.1:${webPort}/api/stream`);
    const reader = res.body.getReader();
    const started = performance.now();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.ok(performance.now() - started < 400, 'first chunk arrives before the stream finishes');
    assert.match(first, /"ip":"(::ffff:)?127\.0\.0\.1"/);
    let rest = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        rest += new TextDecoder().decode(value);
    }
    assert.match(rest, /"n":2/);
    close();
});

test('POST bodies are streamed to the logic server untouched', async () => {
    const up = express();
    up.post('/api/echo', express.text({ type: '*/*' }), (req, res) => res.send(req.body));
    const { webPort, close } = await rig(up);
    const body = 'p&ss<word>1 ' + 'x'.repeat(100_000);
    const r = await fetch(`http://127.0.0.1:${webPort}/api/echo`, { method: 'POST', body, headers: { 'content-type': 'text/plain' } });
    assert.equal(await r.text(), body);
    close();
});

test('/api/tools is served locally, cached, and works with the logic server down', async () => {
    const web = http.createServer(createWebApp({ config: base, logicUrl: 'http://127.0.0.1:1' }));
    const p = await listen(web);
    const r = await fetch(`http://127.0.0.1:${p}/api/tools`);
    assert.equal(r.status, 200);
    const tools = await r.json();
    assert.ok(tools.some((t) => t.filename === 'average'));
    web.closeAllConnections();
    web.close();
});

test('path traversal and malformed URLs are rejected by the web tier', async () => {
    const { webPort, close } = await rig(express());
    assert.equal((await fetch(`http://127.0.0.1:${webPort}/tools/..%2f..%2fetc`)).status, 400);
    assert.equal((await fetch(`http://127.0.0.1:${webPort}/%E0%A4%A`)).status, 400);
    close();
});
