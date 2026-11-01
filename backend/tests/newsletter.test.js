import test from 'node:test';
import assert from 'node:assert/strict';
import { NewsletterOutbox } from '../newsletter/outbox.js';
import { MemoryOutboxStore } from '../newsletter/store.js';
import { runCompetitionJob } from '../newsletter/jobs.js';

const cfg = { batch_size: 50, max_connections: 4, max_attempts: 3 };
const comp = { id: 'Berlin2027', name: 'Berlin <Open> 2027', country_iso2: 'DE', start_date: '2027-03-01', end_date: '2027-03-02', city: 'Berlin' };

function setup(n = 10, { transport } = {}) {
    const store = new MemoryOutboxStore();
    for (let i = 0; i < n; i++) store.addSubscriber(`t${i}`, { email: `u${i}@example.com`, country: 'DE', confirmed: true });
    store.addSubscriber('fr', { email: 'fr@example.com', country: 'FR', confirmed: true });
    store.addSubscriber('unconfirmed', { email: 'x@example.com', country: 'DE', confirmed: false });
    const sent = [];
    const tr = transport || { sendMail: async (m) => void sent.push(m) };
    let clock = 1_000_000;
    const outbox = new NewsletterOutbox({ store, transport: tr, hostname: 'cubingtools.de', config: cfg, now: () => clock, sender: 'a@b.c' });
    return { store, outbox, sent, tick: (ms) => (clock += ms) };
}

test('enqueue is idempotent and only targets confirmed subscribers of the country', async () => {
    const { outbox, store } = setup(10);
    assert.equal((await outbox.enqueueCompetition(comp)).enqueued, 10);
    assert.equal((await outbox.enqueueCompetition(comp)).enqueued, 0); // re-run after a crash: no duplicates
    assert.equal(store.items.size, 10);
});

test('dispatch sends each mail exactly once, escapes content, adds List-Unsubscribe', async () => {
    const { outbox, sent } = setup(5);
    await outbox.enqueueCompetition(comp);
    const stats = await outbox.dispatchOnce();
    assert.equal(stats.sent, 5);
    assert.equal((await outbox.dispatchOnce()).claimed, 0);
    assert.equal(sent.length, 5);
    assert.ok(sent[0].html.includes('Berlin &lt;Open&gt; 2027'));
    assert.ok(!sent[0].html.includes('${'), 'all template placeholders replaced');
    assert.match(sent[0].headers['List-Unsubscribe'], /unsubscribe\?token=t\d/);
});

test('concurrent dispatchers never double-send (visibility timeout claim)', async () => {
    const { outbox, sent } = setup(30);
    await outbox.enqueueCompetition(comp);
    const results = await Promise.all([outbox.dispatchOnce(), outbox.dispatchOnce(), outbox.dispatchOnce()]);
    assert.equal(results.reduce((a, r) => a + r.sent, 0), 30);
    assert.equal(new Set(sent.map((m) => m.to)).size, 30);
});

test('transient failure retries with backoff, then dies after max_attempts', async () => {
    let calls = 0;
    const { outbox, store, tick } = setup(1, { transport: { sendMail: async () => (calls++, Promise.reject(new Error('421 try later'))) } });
    await outbox.enqueueCompetition(comp);
    assert.equal((await outbox.dispatchOnce()).retried, 1);
    assert.equal((await outbox.dispatchOnce()).claimed, 0, 'not due before backoff elapses');
    tick(2 * 60 * 1000);
    assert.equal((await outbox.dispatchOnce()).retried, 1);
    tick(10 * 60 * 1000);
    assert.equal((await outbox.dispatchOnce()).dead, 1);
    const item = [...store.items.values()][0];
    assert.equal(item.status, 'dead');
    assert.equal(item.nextAttemptAt, undefined);
    assert.equal(calls, 3);
});

test('recipient-specific SMTP rejection is dead immediately', async () => {
    const err = Object.assign(new Error('550 no such user'), { responseCode: 550 });
    const { outbox } = setup(1, { transport: { sendMail: async () => Promise.reject(err) } });
    await outbox.enqueueCompetition(comp);
    assert.equal((await outbox.dispatchOnce()).dead, 1);
});

test('crashed dispatcher: claimed items become eligible again after the lock expires', async () => {
    const { outbox, store, tick } = setup(2);
    await outbox.enqueueCompetition(comp);
    await store.claimDue(1_000_000, 10, 5 * 60 * 1000); // claimed, then the process "dies"
    assert.equal((await outbox.dispatchOnce()).claimed, 0);
    tick(6 * 60 * 1000);
    assert.equal((await outbox.dispatchOnce()).sent, 2);
});

test('subscribers who unsubscribed after enqueueing are skipped', async () => {
    const { outbox, store, sent } = setup(3);
    await outbox.enqueueCompetition(comp);
    store.subscribers.delete('t1');
    const s = await outbox.dispatchOnce();
    assert.equal(s.skipped, 1);
    assert.equal(sent.length, 2);
});

test('large fan-out: 5,000 subscribers drain in batches', async () => {
    const { outbox, sent } = setup(5000);
    assert.equal((await outbox.enqueueCompetition(comp)).enqueued, 5000);
    let total = 0;
    for (let i = 0; i < 200; i++) {
        const s = await outbox.dispatchOnce();
        total += s.sent;
        if (!s.claimed) break;
    }
    assert.equal(total, 5000);
    assert.equal(sent.length, 5000);
});

test('first run against an empty notified-set seeds instead of mass-mailing', async () => {
    const { store, outbox } = setup(3);
    const http = { get: async (_u, { params }) => ({ data: params.page === 1 ? [comp] : [] }) };
    const quiet = { log() {}, warn() {}, error() {} };
    const r1 = await runCompetitionJob({ store, outbox, http, log: quiet });
    assert.equal(r1.seeded, 1);
    assert.equal(store.items.size, 0);
    const second = { ...comp, id: 'Munich2027' };
    const http2 = { get: async (_u, { params }) => ({ data: params.page === 1 ? [comp, second] : [] }) };
    const r2 = await runCompetitionJob({ store, outbox, http: http2, log: quiet });
    assert.equal(r2.competitions, 1);
    assert.equal(r2.enqueued, 3);
});
