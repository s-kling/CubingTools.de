import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { WcaImporter } from '../wca/importer.js';
import { WcaStore } from '../wca/store.js';
import { writeTsvFixture } from './fixtures.js';

async function importFixture(opts = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wca-'));
    const tsv = writeTsvFixture(path.join(dir, 'tsv'), opts);
    const importer = new WcaImporter({ dir });
    const out = path.join(dir, 'wca-test.db');
    await importer.buildDatabase(tsv, out, { exportDate: '2026-01-01T00:00:00Z' });
    importer._publish('wca-test.db', { exportDate: '2026-01-01T00:00:00Z', version: 'v1' });
    return { dir, importer, store: new WcaStore({ dir, pollMs: 0 }) };
}

test('import aggregates attempts in SQL regardless of file order', async () => {
    for (const shuffleAttempts of [false, true]) {
        const { store } = await importFixture({ shuffleAttempts });
        const rows = store.getEventResults('2015TEST01', '333');
        const first = rows.find((r) => r.round_type_id === '1');
        assert.deepEqual(first.attempts, [900, 850, 1000, 950, 920]);
        const early = rows.find((r) => r.competition_id === 'Early2024');
        assert.deepEqual(early.attempts, [1000, 1100, 1200, 1050, -1]);
        store.close();
    }
});

test('persons: only sub_id 1 is kept (previously the last row in the file won)', async () => {
    const { store } = await importFixture();
    assert.deepEqual({ ...store.getPerson('2015TEST01') }, { wca_id: '2015TEST01', name: 'Alice Test', country_id: 'DE' });
    store.close();
});

test('results come back newest first with rounds ordered inside one competition', async () => {
    const { store } = await importFixture();
    const rows = store.getEventResults('2015TEST01', '333');
    // Late2024 final, Late2024 first round, Early2024 final
    assert.deepEqual(rows.map((r) => `${r.competition_id}:${r.round_type_id}`), ['Late2024:c', 'Late2024:1', 'Early2024:c']);
});

test('only the requested event is read and limits/offsets work', async () => {
    const { store } = await importFixture();
    assert.equal(store.getEventResults('2015TEST01', '222').length, 1);
    assert.equal(store.getEventResults('2015TEST01', '333', { limit: 1 }).length, 1);
    assert.equal(store.getEventResults('2015TEST01', '333', { limit: 5, offset: 2 }).length, 1);
});

test('getRecentSolves skips DNF/empty attempts and returns newest first', async () => {
    const { store } = await importFixture();
    assert.equal(store.getRecentSolves('2015TEST01', '333', 6).length, 6);
    const solves = store.getRecentSolves('2015TEST01', '333', 100);
    assert.equal(solves.length, 14); // 5 + 5 + 4 valid (one DNF skipped)
    assert.equal(solves[0], 950); // last attempt of the most recent round
    assert.ok(!solves.includes(-1) && !solves.includes(0));
});

test('personal records and competition overlap query', async () => {
    const { store } = await importFixture();
    assert.deepEqual(JSON.parse(JSON.stringify(store.getPersonalRecords('2015TEST01'))), {
        333: { single: { best: 800 }, average: { best: 900 } },
        222: { single: { best: 200 } },
    });
    // A competition running 2024-06-01..02 overlaps a window that starts on the 2nd.
    const comps = store.getCompetitions({ startInt: 20240602, endInt: 20240630 });
    assert.deepEqual(comps.map((c) => c.competition_id), ['Late2024']);
    assert.deepEqual(store.getCompetitions({ startInt: 20240101, endInt: 20241231, country: 'FR' }).map((c) => c.competition_id), ['Abroad2024']);
    assert.equal(store.getCompetitions({ startInt: 20240101, endInt: 20241231, query: '100%' }).length, 0); // LIKE wildcards escaped
});

test('schema drift fails loudly and publishes nothing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wca-'));
    const tsv = writeTsvFixture(path.join(dir, 'tsv'));
    const f = path.join(tsv, 'WCA_export_results.tsv');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('person_id', 'person'));
    const importer = new WcaImporter({ dir });
    await assert.rejects(importer.buildDatabase(tsv, path.join(dir, 'x.db')), /schema mismatch/);
    assert.equal(fs.existsSync(path.join(dir, 'x.db')), false);
});

test('garbage attempts file is rejected instead of importing results without attempts', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wca-'));
    const tsv = writeTsvFixture(path.join(dir, 'tsv'));
    fs.writeFileSync(path.join(tsv, 'WCA_export_result_attempts.tsv'), 'a\tb\tc\n'.repeat(20));
    await assert.rejects(new WcaImporter({ dir }).buildDatabase(tsv, path.join(dir, 'x.db')), /lacks column|unusable/);
});

test('readers pick up a newly published version without restarting', async () => {
    const { dir, importer, store } = await importFixture();
    assert.equal(store.version(), 'v1');
    const tsv2 = writeTsvFixture(path.join(dir, 'tsv2'));
    fs.appendFileSync(path.join(tsv2, 'WCA_export_persons.tsv'), 'Carol New\t2020NEWW01\t1\tAT\tf\n');
    await importer.buildDatabase(tsv2, path.join(dir, 'wca-test2.db'));
    assert.equal(store.getPerson('2020NEWW01'), null);
    importer._publish('wca-test2.db', { exportDate: '2026-02-01', version: 'v2' });
    assert.equal(store.getPerson('2020NEWW01').name, 'Carol New');
    assert.equal(store.version(), 'v2');
});

test('stray rows with attempt_number > 5 are skipped, not fatal (real export has e.g. 38)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wca-'));
    const tsv = writeTsvFixture(path.join(dir, 'tsv'));
    fs.appendFileSync(path.join(tsv, 'WCA_export_result_attempts.tsv'), '10\t38\t1234\n');
    const out = path.join(dir, 'x.db');
    await new WcaImporter({ dir }).buildDatabase(tsv, out);
    importerPointer(dir, out);
    const store = new WcaStore({ dir });
    assert.deepEqual(store.getEventResults('2015TEST01', '333').find((r) => r.competition_id === 'Early2024').attempts, [1000, 1100, 1200, 1050, -1]);
    store.close();
});

function importerPointer(dir, out) {
    fs.writeFileSync(path.join(dir, 'current.json'), JSON.stringify({ file: path.basename(out), version: 'x', exportDate: 'x' }));
}

test('export format major version is checked (README recommends it)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wca-'));
    const imp = new WcaImporter({ dir });
    fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify({ export_format_version: '2.0.2' }));
    assert.equal(imp.assertFormatVersion(dir).export_format_version, '2.0.2');
    for (const v of ['v2.0.2', 'V2.1.0', ' 2.0.3']) {
        fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify({ export_format_version: v }));
        assert.equal(imp.assertFormatVersion(dir).export_format_version, v);
    }
    for (const v of ['v3.0.0', '3.0.0', '', undefined, 'garbage']) {
        fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify({ export_format_version: v }));
        assert.throws(() => imp.assertFormatVersion(dir), /Unsupported WCA export format/);
    }
    fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify({ export_format_version: '3.0.0' }));
    assert.throws(() => imp.assertFormatVersion(dir), /Unsupported WCA export format 3\.0\.0/);
});

test('refresh downloads from the tsv_url advertised by the export API', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wca-'));
    const seen = [];
    const http = { get: async (url) => { seen.push(url); if (/export\/public/.test(url)) return { data: { export_date: '2026-10-31T00:19:51+00:00', tsv_url: 'https://exports.example/WCA_export_v2_303.tsv.zip' } }; throw new Error('stop after download request'); } };
    await assert.rejects(new WcaImporter({ dir, http }).refresh({ force: true }), /stop after download/);
    assert.ok(seen.includes('https://exports.example/WCA_export_v2_303.tsv.zip'));
});

test('GET /api/wca/countries reads the imported export TSV and returns WCA entries', async () => {
    const { default: WcaApi } = await import('../API/API/wca.api.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wca-countries-'));
    fs.writeFileSync(path.join(dir, 'WCA_export_countries.tsv'), [
        'id\tiso2\tname\tcontinent_id',
        'Germany\tDE\tGermany\t_Europe',
        'USA\tUS\tUnited States\t_North America',
        'XA\tXA\tMultiple Countries (Asia)\t_Asia',
    ].join('\n'));

    const api = new WcaApi({ store: { dir, version: () => 'imported', getPerson: () => null } });

    let body;
    const res = {
        status() { return this; },
        json(b) { body = b; return this; },
        set() { return this; },
    };

    await api.handleCountriesRequest({}, res);
    assert.deepEqual(body, [
        { id: 'Germany', iso2: 'DE', name: 'Germany', continent_id: '_Europe', isPseudoCountry: false },
        { id: 'USA', iso2: 'US', name: 'United States', continent_id: '_North America', isPseudoCountry: false },
        { id: 'XA', iso2: 'XA', name: 'Multiple Countries (Asia)', continent_id: '_Asia', isPseudoCountry: true },
    ]);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('GET /api/wca/:id/:event keeps the client contract: number for 1-2 solves, null only when there are none', async () => {
    const { default: WcaApi } = await import('../API/API/wca.api.js');
    const { store } = await importFixture();
    const api = new WcaApi({ store });
    const call = async (event, num) => {
        let body;
        const res = { status() { return this; }, set() { return this; }, json(b) { body = b; return this; } };
        await api.handleRequest({ params: { wcaId: '2015TEST01', event }, query: { num } }, res);
        return body;
    };
    assert.equal((await call('222', '2')).average, 0); // two solves -> 0, never null (Guildford rejects non-numbers)
    assert.equal((await call('222', '25')).average, 2.5); // 200/250/300 -> middle value
    assert.equal((await call('pyram', '25')).average, null); // no results at all
    assert.equal(typeof (await call('333', '12')).records.single, 'number');
    store.close();
});

test('result_attempts column order is detected (layouts seen or plausible in the wild)', async () => {
    for (const layout of ['id-n-v', 'v-n-id', 'n-id-v']) {
        const { store } = await importFixture({ layout });
        const rows = store.getEventResults('2015TEST01', '333');
        assert.deepEqual(rows.find((r) => r.round_type_id === '1').attempts, [900, 850, 1000, 950, 920], layout);
        store.close();
    }
});

test('result_attempts with a header row is mapped by column name, in any order', async () => {
    const { store } = await importFixture({ layout: 'header-shuffled' });
    assert.deepEqual(store.getEventResults('2015TEST01', '222')[0].attempts.filter((v) => v !== 0), [200, 250, 300]);
    store.close();
});

test('detection is not fooled when centisecond values also look like result ids (realistic scale)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wca-'));
    const tsv = writeTsvFixture(path.join(dir, 'tsv'));
    const N = 3000; // ids 1..3000; times 800..1199 are all valid-looking ids
    fs.writeFileSync(path.join(tsv, 'WCA_export_results.tsv'), ['id', 'person_id', 'competition_id', 'event_id', 'round_type_id', 'pos', 'best', 'average', 'format_id', 'regional_single_record', 'regional_average_record'].join('\t') + '\n' +
        Array.from({ length: N }, (_, i) => [i + 1, '2015TEST01', 'Late2024', '333', 'c', 1, 800, 900, 'a', '', ''].join('\t')).join('\n') + '\n');
    const lines = [];
    for (let id = 1; id <= N; id++) for (let n = 1; n <= 5; n++) lines.push([800 + ((id * n) % 400), n, id].join('\t')); // value, attempt_number, result_id
    fs.writeFileSync(path.join(tsv, 'WCA_export_result_attempts.tsv'), lines.join('\n') + '\n');
    const out = path.join(dir, 'x.db');
    await new WcaImporter({ dir }).buildDatabase(tsv, out);
    fs.writeFileSync(path.join(dir, 'current.json'), JSON.stringify({ file: 'x.db', version: 'x', exportDate: 'x' }));
    const store = new WcaStore({ dir });
    const r = store.getEventResults('2015TEST01', '333', { limit: 3000 });
    assert.equal(r.length, N);
    assert.ok(r.every((x) => x.attempts.length === 5), 'every result got all five attempts');
    store.close();
});

test('attempts that do not belong to the imported results fail the import (no silent null averages)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wca-'));
    const tsv = writeTsvFixture(path.join(dir, 'tsv'));
    fs.writeFileSync(path.join(tsv, 'WCA_export_result_attempts.tsv'), Array.from({ length: 50 }, (_, i) => [900000 + i, 1 + (i % 5), 1000 + i].join('\t')).join('\n') + '\n');
    await assert.rejects(new WcaImporter({ dir }).buildDatabase(tsv, path.join(dir, 'x.db')), /cannot match any column order|have attempts/);
});

test('a database built by an older importer version is rebuilt even if the export date is unchanged', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wca-'));
    fs.writeFileSync(path.join(dir, 'current.json'), JSON.stringify({ file: 'old.db', version: '1', exportDate: '2026-10-31', checkedAt: new Date().toISOString() }));
    const http = { get: async () => ({ data: { export_date: '2026-10-31', tsv_url: 'https://x/y.zip' } }) };
    const chk = await new WcaImporter({ dir, http }).checkForNewerExport();
    assert.equal(chk.needsDownload, true);
    // and a current-version pointer inside the max-age window is left alone
    const imp = new WcaImporter({ dir, http });
    imp._publish('new.db', { exportDate: '2026-10-31', version: '2' });
    assert.equal((await imp.checkForNewerExport()).needsDownload, false);
});

// ── API handlers on top of the imported fixture ──────────────────────────
async function apiRig() {
    const { default: WcaApi } = await import('../API/API/wca.api.js');
    const { store } = await importFixture();
    const api = new WcaApi({ store });
    const call = async (method, query, params = {}) => {
        const out = {};
        const res = { status(c) { out.status = c; return this; }, set() { return this; }, json(b) { out.body = JSON.parse(JSON.stringify(b)); return this; } };
        await api[method]({ query, params }, res);
        return out;
    };
    return { api, store, call };
}

test('batch averages: many competitors and events in one call, null (not 0) when there is not enough data', async () => {
    const { store, call } = await apiRig();
    const r = await call('handleBatchAveragesRequest', { ids: '2015TEST01,2016OTHR01,2099NONE01,bad', events: '333,222,pyram', num: '12' });
    assert.equal(r.status, undefined);
    const a = r.body.averages;
    assert.equal(a['2015TEST01']['333'], 9.37); // newest 12 of 14 valid solves, best and worst dropped
    assert.equal(a['2015TEST01']['222'], 2.5);
    assert.equal(a['2015TEST01']['pyram'], null);
    assert.equal(a['2099NONE01']['333'], null);
    assert.equal(a['BAD']['333'], null);
    // 1-2 solves: the legacy endpoint answers 0, the batch endpoint never invents a value
    const few = await call('handleBatchAveragesRequest', { ids: '2015TEST01', events: '222', num: '2' });
    assert.equal(few.body.averages['2015TEST01']['222'], null);
    store.close();
});

test('batch averages: input validation', async () => {
    const { store, call } = await apiRig();
    assert.equal((await call('handleBatchAveragesRequest', { events: '333' })).status, 400);
    assert.equal((await call('handleBatchAveragesRequest', { ids: 'x', events: '33;3' })).status, 400);
    assert.equal((await call('handleBatchAveragesRequest', { ids: Array.from({ length: 301 }, (_, i) => `2020TEST${String(i % 99).padStart(2, '0')}${i}`).join(','), events: '333' })).status, 400);
    store.close();
});

test('getsolves keeps DNFs in position only when asked (?dnf=1)', async () => {
    const { store, call } = await apiRig();
    const plain = await call('handleRequest', { getsolves: 'true' }, { wcaId: '2015TEST01', event: '333' });
    const withDnf = await call('handleRequest', { getsolves: 'true', dnf: '1' }, { wcaId: '2015TEST01', event: '333' });
    assert.ok(plain.body.allResults.every((v) => v > 0));
    assert.equal(withDnf.body.allResults.filter((v) => v === -1).length, 1);
    assert.equal(withDnf.body.allResults.length, plain.body.allResults.length + 1);
    store.close();
});

test('the per-person endpoint uses the shared trimming rule (5%: 25 solves drop 2 from each end)', async () => {
    const { calculateAverage } = await import('../wca/stats.js');
    const solves = Array.from({ length: 25 }, (_, i) => (i + 1) * 100); // 1.00 .. 25.00 s
    assert.equal(calculateAverage(solves), 13);
    assert.equal(calculateAverage(solves.slice(0, 12)), 6.5); // 12 solves: 1 from each end, unchanged from before
});
