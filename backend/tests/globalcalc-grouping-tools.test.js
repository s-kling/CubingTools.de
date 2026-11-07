import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './helpers/page.js';

// ── GlobalCalc ───────────────────────────────────────────────────────────

async function globalCalc(attemptsCs, event = '333') {
    const p = await openPage('/tools/globalCalc/', { wait: 200 });
    const { window, document } = p;
    document.getElementById('event-type').value = event;
    window.eval(`originalArray = ${JSON.stringify(attemptsCs)}; inputArray = [...originalArray]; initializeSlider(); updateChart();`);
    return { p, text: (id) => document.getElementById(id).textContent };
}

test('GlobalCalc: DNFs stay in place, so an average is never built from solves that were not consecutive', async () => {
    // seconds: 5 6 DNF DNF DNF 7 8 9. Dropping the DNFs first (the old behaviour) fabricates the "average" 7.00.
    const { p, text } = await globalCalc([500, 600, -1, -1, -1, 700, 800, 900]);
    assert.match(text('bestAverage'), /too many DNFs/);
    assert.equal(text('bestSingle'), '5.00');
    await p.close();
});

test('GlobalCalc: a single DNF inside a window is a valid Ao5 (best average uses the WCA rule)', async () => {
    const { p, text } = await globalCalc([1000, 1100, -1, 1200, 1300]);
    assert.equal(text('bestAverage'), '12.00'); // drops 10.00 and the DNF -> (11 + 12 + 13) / 3
    await p.close();
});

test('GlobalCalc: Mo3 events use the mean (333bf is a Mo3 event, like in every other tool)', async () => {
    const { p, text } = await globalCalc([3000, 3100, 3200, 3300], '333bf');
    assert.equal(text('bestAverage'), '31.00'); // mean(30, 31, 32)
    await p.close();
});

test('GlobalCalc: only DNFs gives an empty state instead of NaN/Infinity output', async () => {
    const { p, text, } = await globalCalc([-1, -1, -1, -1, -1, -1]);
    assert.ok(!/NaN|Infinity/.test(text('bestSingle') + text('bestAverage') + text('predictedGlobal')));
    await p.close();
});

test('GlobalCalc: Average tool data is read newest-first with DNFs kept (slider keeps the most RECENT n)', async () => {
    const saved = JSON.stringify([
        ['11.00', '333', 'a1', [[10, null, 'a1'], [11, null, 'a1'], [12, null, 'a1'], [13, null, 'a1'], [14, null, 'a1']]],
        ['21.00', '333', 'a2', [[20, null, 'a2'], [21, null, 'a2'], [22, null, 'a2'], [0, 'dnf', 'a2'], [24, null, 'a2']]],
    ]);
    const p = await openPage('/tools/globalCalc/', { wait: 200, beforeParse: (w) => w.localStorage.setItem('ct_averages', saved) });
    const { window, document } = p;
    window.eval(`currentDataSourceMode = 'average'`);
    const select = document.getElementById('averageEventType');
    select.innerHTML = '<option value="333">333</option>';
    select.value = '333';
    window.loadAverageToolData?.() ?? window.eval('typeof loadAverageToolData === "function" && loadAverageToolData()');
    await new Promise((r) => setTimeout(r, 100));
    const arr = JSON.parse(window.eval('JSON.stringify(originalArray)'));
    assert.equal(arr.length, 10);
    assert.equal(arr[0], 2400, 'newest solve first');
    assert.equal(arr[1], -1, 'DNF kept in position');
    assert.equal(arr.at(-1), 1000);
    await p.close();
});

// ── Grouping ─────────────────────────────────────────────────────────────

const people = (n, extra = {}) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        name: i === 0 ? '李小龙 Müller' : `Person ${i + 1}`,
        wcaId: `2020TEST${String(i + 1).padStart(2, '0')}`,
        events: ['333'],
        groupAssignments: {},
        ...extra,
    }));

async function grouping({ n = 12, sortType = 'Round Robin', maxCompetitors = 6 } = {}) {
    const calls = [];
    const p = await openPage('/tools/grouping/', {
        wait: 200,
        apiStub: (u) => {
            if (u.includes('/api/wca/averages')) {
                calls.push(u);
                const ids = new URL(u, 'http://x').searchParams.get('ids').split(',');
                // person k has average 10 + k seconds (person 1 is fastest)
                return { averages: Object.fromEntries(ids.map((id) => [id, { 333: 10 + Number(id.slice(-2)) }])) };
            }
        },
    });
    const { window, document } = p;
    document.body.insertAdjacentHTML('beforeend', `<select id="competitor-sort-type-333"><option>${sortType}</option></select>`);
    window.eval(`competitors = ${JSON.stringify(people(n))}; selectedEvents = ['333']; competitionData = { maxCompetitors: ${maxCompetitors} }; includeJudges = false; includeRunners = false;`);
    return { p, window, calls };
}

test('Grouping: averages are fetched with ONE request for all competitors (was 1 per competitor and event)', async () => {
    const { p, window, calls } = await grouping({ n: 40 });
    await window.generateGroups();
    assert.equal(calls.length, 1);
    await p.close();
});

test('Grouping: fastest first, competitors without a usable average last, ties keep their order', async () => {
    const { p, window } = await grouping({ n: 6 });
    window.eval(`competitors[2].wcaId = undefined;`); // person 3 has no WCA ID
    await window.prefetchAverages(window.eval('competitors'), ['333']);
    const order = JSON.parse(window.eval(`JSON.stringify(sortArray(competitors, '333').map(c => c.id))`));
    assert.deepEqual(order, [1, 2, 4, 5, 6, 3]);
    await p.close();
});

test('Grouping: Linear mode no longer reverses the scrambler pool (scramblers come from the fastest competitors)', async () => {
    for (let run = 0; run < 25; run++) {
        const { p, window } = await grouping({ n: 12, sortType: 'Linear' });
        await window.generateGroups();
        const firstGroupScramblers = JSON.parse(window.eval(`JSON.stringify(competitionData.groups['333'][0].scramblers.map(c => c.id))`));
        // Linear = slowest first: group 1 holds the slowest six, so its scrambler must be one of the two fastest overall
        assert.ok(firstGroupScramblers.every((id) => id <= 2), `run ${run}: ${firstGroupScramblers}`);
        await p.close();
    }
});

test('Grouping: the shareable URL survives non-Latin names and keeps WCA IDs', async () => {
    const { p, window } = await grouping({ n: 4 });
    await window.generateGroups();
    const href = window.location.href;
    assert.match(href, /[?&]cd=/);
    await p.close();

    const reopened = await openPage(href.replace(/^http:\/\/[^/]+/, ''), { wait: 300 });
    const restored = JSON.parse(reopened.window.eval(`JSON.stringify(competitors.map(c => [c.name, c.wcaId]))`));
    assert.equal(restored[0][0], '李小龙 Müller');
    assert.equal(restored[0][1], '2020TEST01');
    await reopened.close();
});
