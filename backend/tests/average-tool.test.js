import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './helpers/page.js';

async function session(event = '333') {
    const p = await openPage('/tools/average/');
    const { window } = p;
    const el = window.document.getElementById('event-type');
    el.value = event;
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
    const add = (text) => {
        window.document.getElementById('timeInput').value = text;
        window.addTime();
    };
    // JSON round-trip: arrays created inside jsdom are a different realm's Array and fail deepStrictEqual.
    const tags = () => JSON.parse(window.eval('JSON.stringify(state.averageTags.map(t => t.average))'));
    return { p, add, tags, window };
}

test('Ao5 with exactly one DNF is a valid, saved average (WCA: the DNF is the dropped worst)', async () => {
    const { p, add, tags } = await session('333');
    for (const t of ['DNF', '9.00', '10.00', '11.00', '12.00']) add(t);
    assert.deepEqual(tags(), ['11.00']);
    await p.close();
});

test('Ao5 with two DNFs is saved as a DNF average (it used to vanish)', async () => {
    const { p, add, tags } = await session('333');
    for (const t of ['DNF', 'DNF', '10.00', '11.00', '12.00']) add(t);
    assert.deepEqual(tags(), ['DNF']);
    await p.close();
});

test('normal Ao5 drops best and worst and rounds to centiseconds', async () => {
    const { p, add, tags } = await session('333');
    for (const t of ['9.99', '10.00', '10.01', '30.00', '5.00']) add(t);
    assert.deepEqual(tags(), ['10.00']); // (9.99 + 10.00 + 10.01) / 3
    await p.close();
});

test('Mo3 events: any DNF makes a DNF mean, otherwise the plain mean', async () => {
    let s = await session('666');
    for (const t of ['1:00.00', '1:01.00', '1:02.00']) s.add(t);
    assert.deepEqual(s.tags(), ['61.00']);
    await s.p.close();
    s = await session('666');
    for (const t of ['1:00.00', 'DNF', '1:02.00']) s.add(t);
    assert.deepEqual(s.tags(), ['DNF']);
    await s.p.close();
});

test('3x3 blindfolded and fewest moves are Mean-of-3 events everywhere', async () => {
    const { p, window } = await session('333');
    assert.deepEqual(JSON.parse(window.eval('JSON.stringify(meanEvents.slice().sort())')), ['333bf', '333fm', '444bf', '555bf', '666', '777'].sort());
    await p.close();
});

test('formatTime never prints 60.00 seconds or a zero-padded 010.00', async () => {
    const { p, window } = await session('333');
    assert.equal(window.formatTime(59.996), '1:00.00');
    assert.equal(window.formatTime(119.996), '2:00.00');
    assert.equal(window.formatTime(9.996), '10.00');
    assert.equal(window.formatTime(Infinity), 'DNF');
    await p.close();
});

test('the time input mask and parser agree', async () => {
    const { p, window } = await session('333');
    const input = { value: '' };
    for (const [typed, shown] of [['1', '0.01'], ['1234', '12.34'], ['12345', '1:23.45'], ['DNF', 'DNF']]) {
        input.value = typed;
        window.formatInputField(input);
        assert.equal(input.value, shown);
    }
    assert.equal(window.parseTimeString('1:23.45').raw, 83.45);
    assert.equal(window.parseTimeString('12,34').error, 'Invalid time format'); // used to silently become 12
    assert.equal(window.parseTimeString('-5').error, 'Invalid time format');
    await p.close();
});

test('a finished average is saved when the page is hidden/closed, not 5 seconds later', async () => {
    const { p, add, window } = await session('333');
    for (const t of ['9.00', '10.00', '11.00', '12.00', '13.00']) add(t);
    assert.equal(window.localStorage.getItem('ct_averages'), null, 'debounced save has not run yet');
    window.dispatchEvent(new window.Event('pagehide'));
    const saved = JSON.parse(window.localStorage.getItem('ct_averages'));
    assert.equal(saved.length, 1);
    assert.equal(saved[0][0], '11.00');
    await p.close();
});
