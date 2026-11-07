import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './helpers/page.js';

const HOSTILE = '<img src=x onerror="window.__xss=1">';

async function guildford({ query = '', averages = {} } = {}) {
    const calls = [];
    const p = await openPage(`/tools/guildford/?pickup=1.238&solvecount=25&c1=2023KLIN02${query}`, {
        wait: 300,
        apiStub: (u) => {
            calls.push(u);
            if (/\/api\/wca\/averages/.test(u)) {
                const events = new URL(u, 'http://x').searchParams.get('events').split(',');
                return { averages: { '2023KLIN02': Object.fromEntries(events.map((e, i) => [e, e in averages ? averages[e] : 8 + i])) } };
            }
            if (/\/2023KLIN02\/name$/.test(u)) return { name: 'Sebastian Kling' };
        },
    });
    return { p, calls: () => calls.filter((c) => c.startsWith('/api/wca')) };
}

test('loading a competitor takes ONE request for all events (was one per event)', async () => {
    const { p, calls } = await guildford();
    await p.window.handleButtons('c1');
    const wca = calls();
    assert.equal(wca.filter((c) => c.includes('/api/wca/averages')).length, 1);
    assert.equal(wca.length, 2); // name + averages
    const inputs = [...p.document.querySelectorAll('input[id^="c1-"]')].filter((i) => i.id !== 'c1-wca');
    assert.ok(inputs.length >= 10);
    assert.ok(inputs.every((i) => /^\d+(:\d\d)?\.\d\d$/.test(i.value)), inputs.map((i) => `${i.id}=${i.value}`).join(' '));
    await p.close();
});

test('events without a usable average stay empty instead of becoming 0.00 or DNF text', async () => {
    const { p } = await guildford({ averages: { sq1: null, pyram: 0 } });
    await p.window.handleButtons('c1');
    assert.equal(p.document.getElementById('c1-Square-1').value, '');
    assert.equal(p.document.getElementById('c1-Pyraminx').value, '');
    await p.close();
});

test('competitor names from the URL and the API cannot inject markup (c1name/c2name XSS)', async () => {
    const { p } = await guildford({ query: `&c1name=${encodeURIComponent(HOSTILE)}&c2name=${encodeURIComponent('<b>Two</b>')}` });
    for (const input of p.document.querySelectorAll('input[id^="c1-"], input[id^="c2-"]')) {
        if (!input.id.endsWith('-wca')) input.value = '10.00';
    }
    p.window.optimizeGuildford();
    await new Promise((r) => setTimeout(r, 200));
    const html = p.document.body.innerHTML;
    assert.ok(html.includes('&lt;img src=x'), 'hostile name is rendered as text');
    assert.ok(!/<img[^>]*onerror/i.test(html), 'no live <img onerror> in the DOM');
    assert.ok(!html.includes('<b>Two</b>'));
    assert.equal(p.window.__xss, undefined);
    await p.close();
});

test('the optimizer never produces a history table larger than the cap', async () => {
    const { p } = await guildford();
    for (const input of p.document.querySelectorAll('input[id^="c1-"], input[id^="c2-"]')) {
        if (!input.id.endsWith('-wca')) input.value = `${10 + Math.floor(Math.random() * 20)}.00`;
    }
    p.window.optimizeGuildford();
    await new Promise((r) => setTimeout(r, 300));
    const rows = p.document.querySelectorAll('#combinationsTable tbody tr, table tbody tr').length;
    assert.ok(rows <= 210, `history rows: ${rows}`);
    await p.close();
});

test('time formatting: relay totals never show 60.00 seconds and the DNF mask clears the field', async () => {
    const { p, } = await guildford();
    const w = p.window;
    assert.equal(w.formatTime(59.996), '1:00.00');
    assert.equal(w.formatTime(9.996), '0:10.00'); // used to be 0:010.00
    assert.equal(w.formatTime(125.5), '2:05.50');
    assert.ok(Number.isNaN(w.getTimeInSeconds('DNF')));
    assert.ok(Number.isNaN(w.getTimeInSeconds('12,5')));
    assert.equal(w.getTimeInSeconds('1:02.50'), 62.5);
    const field = { value: 'DNF' };
    w.formatInputField(field);
    assert.equal(field.value, '');
    await p.close();
});

test('"use my Average tool times" reads the Average tool\'s real storage key', async () => {
    const saved = JSON.stringify([
        ['12.50', '333', 'a1', [[12, null, 'a1']]],
        ['11.20', '333', 'a2', [[11, null, 'a2']]], // most recent wins
        ['5.00', '222', 'a3', [[5, null, 'a3']]],
        ['DNF', 'pyram', 'a4', [[0, 'dnf', 'a4']]],
    ]);
    const p = await openPage('/tools/guildford/', {
        wait: 200,
        beforeParse: (w) => w.localStorage.setItem('ct_averages', saved),
    });
    p.window.loadAverageToolTimes('c1');
    assert.equal(p.document.getElementById('c1-3x3').value, '11.20');
    assert.equal(p.document.getElementById('c1-2x2').value, '5.00');
    assert.equal(p.document.getElementById('c1-Pyraminx').value, '');
    await p.close();
});
