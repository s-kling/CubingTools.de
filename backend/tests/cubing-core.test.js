import test from 'node:test';
import assert from 'node:assert/strict';
import { CubingCore as C } from '../lib/cubing-core.js';

test('parseTime accepts s, m:ss and h:mm:ss, rejects everything else', () => {
    assert.equal(C.parseTime('12.34').seconds, 12.34);
    assert.equal(C.parseTime('1:02.34').seconds, 62.34);
    assert.equal(C.parseTime('1:02:03.5').seconds, 3723.5);
    assert.equal(C.parseTime('dnf').isDnf, true);
    for (const bad of ['', ' ', 'abc', '12,34', '-5', '1::2', '1:2:3:4', '.', '12.3.4', '1e3']) {
        assert.equal(C.parseTime(bad).error, 'Invalid time format', JSON.stringify(bad));
    }
});

test('formatTime rounds to centiseconds before splitting into minutes', () => {
    assert.equal(C.formatTime(9.996), '10.00');
    assert.equal(C.formatTime(59.996), '1:00.00');
    assert.equal(C.formatTime(119.996), '2:00.00');
    assert.equal(C.formatTime(3599.999), '1:00:00.00');
    assert.equal(C.formatTime(0), '0.00');
    assert.equal(C.formatTime(Infinity), 'DNF');
    assert.equal(C.formatTime(NaN, { dnf: '—' }), '—');
    assert.equal(C.formatCentiseconds(6234), '1:02.34');
});

test('time input mask', () => {
    const m = (v, o) => C.formatTimeInputValue(v, o);
    assert.deepEqual(['1', '12', '123', '1234', '12345', '123456'].map((v) => m(v)), ['0.01', '0.12', '1.23', '12.34', '1:23.45', '12:34.56']);
    assert.equal(m('0'), '');
    assert.equal(m('DNF'), 'DNF');
    assert.equal(m('DNF', { allowDnf: false }), '');
    assert.equal(m('DNF5'), '0.05'); // typing after DNF starts a new number
    assert.equal(m('1:23.45'), '1:23.45'); // idempotent on its own output
    assert.equal(m('12.34'), '12.34');
});

test('WCA averaging rules', () => {
    const D = Infinity;
    // Ao5: best and worst dropped; ONE DNF is allowed, TWO make a DNF
    assert.equal(C.averageForEvent([9, 10, 11, 12, 13], '333'), 11);
    assert.equal(C.averageForEvent([D, 9, 10, 11, 12], '333'), 11);
    assert.equal(C.averageForEvent([D, D, 10, 11, 12], '333'), D);
    // Mo3: plain mean, any DNF is a DNF
    assert.equal(C.averageForEvent([60, 61, 62], '666'), 61);
    assert.equal(C.averageForEvent([60, D, 62], '666'), D);
    // not enough solves yet / uses the LAST n
    assert.equal(C.averageForEvent([1, 2, 3, 4], '333'), null);
    assert.equal(C.averageForEvent([99, 9, 10, 11, 12, 13], '333'), 11);
    // centisecond arithmetic: (9.99 + 10.00 + 10.01) / 3, 0.1 + 0.2 style float noise must not leak out
    assert.equal(C.averageForEvent([1, 9.99, 10.0, 10.01, 99], '333'), 10);
    assert.equal(C.averageForEvent([0.1, 0.2, 0.3, 0.7, 0.9], '333'), 0.4); // (0.2+0.3+0.7)/3 = 0.4
});

test('mean-of-3 events are defined once', () => {
    assert.deepEqual([...C.MEAN_EVENTS].sort(), ['333bf', '333fm', '444bf', '555bf', '666', '777']);
    assert.equal(C.requiredSolves('333'), 5);
    assert.equal(C.requiredSolves('333fm'), 3);
    assert.equal(C.isMeanEvent('333mbf'), false);
});

test('trimmed average of n solves trims 5% (>= 1) from each end', () => {
    assert.deepEqual([5, 12, 20, 25, 50, 100].map(C.trimCount), [1, 1, 1, 2, 3, 5]);
    const solves = Array.from({ length: 25 }, (_, i) => i + 1); // 1..25
    assert.equal(C.trimmedAverage(solves), 13); // drops 1,2 and 24,25 -> mean(3..23) = 13
    assert.equal(C.trimmedAverage([1, 2]), null);
    assert.equal(C.trimmedAverage([Infinity, Infinity, Infinity, 1, 2]), Infinity);
});

test('rolling averages keep DNFs in place', () => {
    const D = Infinity;
    // 3x3: windows of 5. With the DNF kept the only fully-finite-window averages are honest.
    const times = [10, 11, D, 12, 13, 14, 15];
    assert.deepEqual(C.rollingAverages(times, '333'), [12, 13, 14]);
    assert.equal(C.bestRollingAverage(times, '333'), 12);
    // if DNFs were dropped first (what GlobalCalc did) the best "average" would be the optimistic one
    assert.equal(C.bestRollingAverage([10, 11, 12, 13, 14], '333'), 12);
    assert.equal(C.bestRollingAverage([D, D, D, D, D], '333'), null);
});

test('meanOfFinite / mean / bestWorstIndices', () => {
    assert.equal(C.meanOfFinite([1, Infinity, 3]), 2);
    assert.equal(C.meanOfFinite([Infinity]), null);
    assert.equal(C.mean([1, 2, Infinity]), Infinity);
    assert.deepEqual(C.bestWorstIndices([10, 9, 12, 11]), { bestIdx: 1, worstIdx: 2 });
    assert.deepEqual(C.bestWorstIndices([10, Infinity, 9]), { bestIdx: 2, worstIdx: 1 });
});

test('normalCdf', () => {
    assert.ok(Math.abs(C.normalCdf(0) - 0.5) < 1e-7);
    assert.ok(Math.abs(C.normalCdf(1.96) - 0.975) < 1e-3);
    assert.ok(Math.abs(C.normalCdf(10, 10, 2) - 0.5) < 1e-7);
    assert.equal(C.normalCdf(5, 10, 0), 0); // degenerate spread does not produce NaN
});

test('escapeHtml and UTF-8 safe base64url', () => {
    assert.equal(C.escapeHtml(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
    for (const text of ['plain', 'Müller', '李小龙 Иван 🧩', '[1,["a/b+c=="]]']) {
        const enc = C.encodeBase64Url(text);
        assert.match(enc, /^[A-Za-z0-9_-]*$/);
        assert.equal(C.decodeBase64Url(enc), text);
    }
});

test('reads what the Average tool saved (ct_averages / ct_incomplete)', () => {
    const saved = JSON.stringify([
        ['11.00', '333', 'a1', [[10, null, 'a1'], [12, 'plus2', 'a1'], [0, 'dnf', 'a1']]],
        ['9.50', '222', 'a2', [[9.5, null, 'a2']]],
    ]);
    const parsed = C.parseSavedAverages(saved);
    assert.equal(parsed.length, 2);
    assert.deepEqual(parsed[0].solves, [10, 14, Infinity]);
    assert.equal(parsed[1].event, '222');
    assert.deepEqual(C.parseSavedAverages('not json'), []);
    assert.deepEqual(C.parseSavedAverages(null), []);
    assert.deepEqual(C.parseIncompleteSolves('[[8.5,null],[9,"dnf"]]'), [8.5, Infinity]);
});
