import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createWriteStream, createReadStream } from 'fs';
import { Extract } from 'unzipper';
import { DatabaseSync } from 'node:sqlite';
import { parseTsv, buildColumnMap, BatchInserter } from './tsv.js';
import { detectAttemptLayout } from './attempts-layout.js';
import { DEFAULT_EXPORT_DIR, SCHEMA_EXPORT, INDEX_EXPORT, SCHEMA_LIVE, ROUND_ORDER_SQL, toDateInt } from './store.js';

const log = {
    info: (...a) => console.log('[wca-import]', ...a),
    warn: (...a) => console.warn('[wca-import]', ...a),
    error: (...a) => console.error('[wca-import]', ...a),
};

// Bump when the DB layout or the way it is built changes: existing databases are then rebuilt once
// even if the WCA export itself has not changed.
export const IMPORTER_VERSION = 3;

const TSV_FILES = {
    competitions: 'WCA_export_competitions.tsv',
    persons: 'WCA_export_persons.tsv',
    results: 'WCA_export_results.tsv',
    attempts: 'WCA_export_result_attempts.tsv',
    ranksSingle: 'WCA_export_ranks_single.tsv',
    ranksAverage: 'WCA_export_ranks_average.tsv',
};

const APPROX_ROWS = { competitions: 30_000, persons: 250_000, attempts: 30_000_000, results: 6_600_000, ranks: 600_000 };

/**
 * Write side of the WCA data. Runs ONLY in the jobs process.
 *
 * Compared to the previous in-process importer:
 *  - builds a brand-new immutable DB file per export and publishes it by atomically rewriting
 *    current.json, so every logic worker (any process) switches over by itself;
 *  - attempts are aggregated by SQLite in one GROUP BY pass into five columns instead of
 *    6.5M `SELECT ... WHERE result_id = ?` round trips from JS;
 *  - the large staging data lives in a scratch DB that is deleted afterwards, so the
 *    published file has no free-page bloat;
 *  - the whole build runs with journaling off (the file is disposable until published);
 *  - bulk inserts use multi-row statements.
 */
export class WcaImporter {
    constructor({ dir = DEFAULT_EXPORT_DIR, exportMaxAgeMs = 7 * 24 * 60 * 60 * 1000, http = axios } = {}) {
        this.dir = dir;
        this.exportMaxAgeMs = exportMaxAgeMs;
        this.http = http;
        this.urls = {
            competitions: 'https://www.worldcubeassociation.org/api/v0/competitions',
            exportMeta: 'https://www.worldcubeassociation.org/api/v0/export/public',
            exportTsv: 'https://www.worldcubeassociation.org/export/results/v2/tsv',
        };
        this.controlDir = path.join(dir, 'control');
        this.abort = null;
        this.running = false;
        this._status = { state: 'idle', refreshing: false, lastError: null, lastSuccessAt: null, progress: null };
        this._statusWrittenAt = 0;
    }

    // ── status / control channel (file based; logic workers only read/write small files) ──

    _setStatus(patch, { force = false } = {}) {
        Object.assign(this._status, patch);
        const now = Date.now();
        if (!force && now - this._statusWrittenAt < 1000) return;
        this._statusWrittenAt = now;
        try {
            fs.mkdirSync(this.controlDir, { recursive: true });
            const tmp = path.join(this.controlDir, 'status.json.tmp');
            fs.writeFileSync(tmp, JSON.stringify({ ...this._status, updatedAt: new Date().toISOString() }));
            fs.renameSync(tmp, path.join(this.controlDir, 'status.json'));
        } catch (err) {
            log.warn('could not write status:', err.message);
        }
    }

    /** Poll control/ for refresh/cancel requests issued by the admin API. */
    startControlLoop(intervalMs = 2000) {
        fs.mkdirSync(this.controlDir, { recursive: true });
        const take = (name) => {
            const p = path.join(this.controlDir, name);
            try {
                fs.unlinkSync(p);
                return true;
            } catch {
                return false;
            }
        };
        this._setStatus({}, { force: true });
        this._controlTimer = setInterval(() => {
            if (take('cancel.request')) this.cancel();
            if (take('refresh.request') && !this.running) {
                this.refresh({ force: true }).catch((e) => log.error('manual refresh failed:', e.message));
            }
        }, intervalMs);
        this._controlTimer.unref?.();
        return () => clearInterval(this._controlTimer);
    }

    cancel() {
        if (!this.abort || this.abort.signal.aborted) return false;
        this.abort.abort();
        return true;
    }

    // ── pointer helpers ─────────────────────────────────────────────────────

    pointer() {
        try {
            return JSON.parse(fs.readFileSync(path.join(this.dir, 'current.json'), 'utf8'));
        } catch {
            return null;
        }
    }

    _writePointer(obj) {
        const tmp = path.join(this.dir, 'current.json.tmp');
        fs.writeFileSync(tmp, JSON.stringify(obj));
        fs.renameSync(tmp, path.join(this.dir, 'current.json')); // atomic: readers see old or new, never partial
    }

    _publish(file, { exportDate, version }) {
        const now = new Date().toISOString();
        this._writePointer({ file, exportDate, version, importerVersion: IMPORTER_VERSION, publishedAt: now, checkedAt: now });
    }

    _pruneOldVersions(keep = 2) {
        const current = this.pointer()?.file;
        const files = fs
            .readdirSync(this.dir)
            .filter((f) => /^wca-.*\.db$/.test(f))
            .map((f) => ({ f, t: fs.statSync(path.join(this.dir, f)).mtimeMs }))
            .sort((a, b) => b.t - a.t);
        for (const { f } of files.slice(keep)) {
            if (f === current) continue;
            try {
                fs.unlinkSync(path.join(this.dir, f));
            } catch {
                /* ignore */
            }
        }
    }

    // ── network ─────────────────────────────────────────────────────────────

    /** https://www.worldcubeassociation.org/api/v0/export/public -> {export_date, tsv_url, ...} or null. */
    async fetchExportMeta(signal = null) {
        try {
            return (await this.http.get(this.urls.exportMeta, { timeout: 10_000, signal })).data;
        } catch (err) {
            if (signal?.aborted) throw new Error('Refresh cancelled');
            log.warn('export metadata unreachable:', err.message);
            return null;
        }
    }

    /**
     * The export README asks consumers to check metadata.json: a new MAJOR format version means
     * the column layout may have changed, so refuse to import it rather than publish garbage.
     */
    assertFormatVersion(dirPath, supportedMajor = 2) {
        let meta;
        try {
            meta = JSON.parse(fs.readFileSync(path.join(dirPath, 'metadata.json'), 'utf8'));
        } catch {
            log.warn('metadata.json missing in export; skipping format version check');
            return null;
        }
        // The real file says "v2.0.2" (the README sample shows "2.0.2"); accept both.
        const m = /^\s*v?(\d+)/i.exec(String(meta.export_format_version ?? ''));
        const major = m ? Number(m[1]) : NaN;
        if (major !== supportedMajor) {
            throw new Error(`Unsupported WCA export format ${meta.export_format_version} (importer supports ${supportedMajor}.x); review wca/importer.js`);
        }
        return meta;
    }

    async checkForNewerExport(signal = null) {
        const ptr = this.pointer();
        const stored = ptr?.exportDate || null;
        if (ptr && ptr.importerVersion !== IMPORTER_VERSION) {
            log.info(`database was built by importer v${ptr.importerVersion ?? 1}, current is v${IMPORTER_VERSION}: rebuilding`);
            const meta = await this.fetchExportMeta(signal);
            return { needsDownload: true, latestExportDate: meta?.export_date || stored, tsvUrl: meta?.tsv_url };
        }
        if (stored && ptr.checkedAt && Date.now() - new Date(ptr.checkedAt).getTime() < this.exportMaxAgeMs) {
            return { needsDownload: false, latestExportDate: stored };
        }
        const data = await this.fetchExportMeta(signal);
        if (!data) return { needsDownload: false, latestExportDate: stored };
        const latest = data.export_date;
        if (!stored || latest !== stored) return { needsDownload: true, latestExportDate: latest, tsvUrl: data.tsv_url };
        this._writePointer({ ...ptr, checkedAt: new Date().toISOString() });
        return { needsDownload: false, latestExportDate: latest };
    }

    _checkDiskSpace(requiredBytes = 6 * 1024 ** 3) {
        try {
            const st = fs.statfsSync(this.dir);
            const free = st.bavail * st.bsize;
            if (free < requiredBytes) {
                throw new Error(
                    `Insufficient disk space for the WCA import: need ~${(requiredBytes / 1024 ** 3).toFixed(0)} GB, ` +
                        `have ${(free / 1024 ** 3).toFixed(1)} GB in ${this.dir}`,
                );
            }
        } catch (err) {
            if (err.message.startsWith('Insufficient')) throw err;
            log.warn('disk space check unavailable:', err.message);
        }
    }

    async downloadAndExtract(into, signal = null, url = this.urls.exportTsv) {
        fs.mkdirSync(into, { recursive: true });
        const zipPath = path.join(into, 'wca_export.tsv.zip');
        log.info('downloading export ...');
        this._setStatus({ state: 'downloading', progress: null });
        const res = await this.http.get(url, { responseType: 'stream', timeout: 10 * 60 * 1000, signal });
        await pipeline(res.data, createWriteStream(zipPath), { signal });
        log.info('extracting ...');
        this._setStatus({ state: 'extracting' });
        await new Promise((resolve, reject) => {
            const ex = Extract({ path: into });
            const onAbort = () => ex.destroy(new Error('Refresh cancelled'));
            signal?.addEventListener('abort', onAbort, { once: true });
            createReadStream(zipPath)
                .pipe(ex)
                .on('close', () => (signal?.removeEventListener('abort', onAbort), resolve()))
                .on('error', (e) => (signal?.removeEventListener('abort', onAbort), reject(e)));
        });
        fs.unlinkSync(zipPath);
    }

    // ── import ──────────────────────────────────────────────────────────────

    /**
     * Build a database file from extracted TSVs. Returns the path of the finished file.
     * Exposed for tests: point it at a directory with (small) TSV fixtures.
     */
    async buildDatabase(tsvDir, outFile, { signal = null, exportDate = null } = {}) {
        for (const f of [outFile, `${outFile}-journal`, `${outFile}-wal`, `${outFile}-shm`]) fs.rmSync(f, { force: true });
        const scratchFile = `${outFile}.scratch`;
        fs.rmSync(scratchFile, { force: true });

        const db = new DatabaseSync(outFile);
        // Disposable until published: skip journaling and fsyncs.
        db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA temp_store = FILE; PRAGMA cache_size = -131072;');
        db.exec(SCHEMA_EXPORT);
        db.exec(`ATTACH DATABASE '${scratchFile.replace(/'/g, "''")}' AS scratch`);
        db.exec('PRAGMA scratch.journal_mode = OFF; PRAGMA scratch.synchronous = OFF;');

        const progress = (label, approx) => (n) => {
            this._setStatus({ progress: { label, done: n, total: approx } });
            if (n % 1_000_000 === 0) log.info(`${label}: ${n.toLocaleString()} / ~${approx.toLocaleString()}`);
        };
        const file = (k) => path.join(tsvDir, TSV_FILES[k]);

        try {
            this._setStatus({ state: 'importing' });

            // competitions
            db.exec('BEGIN');
            let cols;
            let ins = new BatchInserter(db, 'competitions', ['competition_id', 'name', 'country_id', 'start_date', 'end_date']);
            await parseTsv(file('competitions'), {
                signal,
                onProgress: progress('competitions', APPROX_ROWS.competitions),
                onHeader: (h) => (cols = buildColumnMap(h, ['id', 'name', 'country_id', 'year', 'month', 'day', 'end_year', 'end_month', 'end_day'])),
                rowFn: (f) =>
                    ins.add(
                        f[cols.id], f[cols.name], f[cols.country_id],
                        Number(f[cols.year]) * 10000 + Number(f[cols.month]) * 100 + Number(f[cols.day]),
                        Number(f[cols.end_year]) * 10000 + Number(f[cols.end_month]) * 100 + Number(f[cols.end_day]),
                    ),
            });
            ins.flush();

            // persons - only the current row per person when the export carries sub_ids
            // (older rows are previous names/countries; the last row in the file used to win).
            ins = new BatchInserter(db, 'persons', ['wca_id', 'name', 'country_id']);
            await parseTsv(file('persons'), {
                signal,
                onProgress: progress('persons', APPROX_ROWS.persons),
                onHeader: (h) => {
                    cols = buildColumnMap(h, ['wca_id', 'name', 'country_id']);
                    cols.sub = h.map((x) => x.trim()).indexOf('sub_id');
                },
                rowFn: (f) => {
                    if (cols.sub >= 0 && f[cols.sub] !== '1') return;
                    ins.add(f[cols.wca_id], f[cols.name], f[cols.country_id]);
                },
            });
            ins.flush();
            db.exec('COMMIT');

            // results -> scratch stage, then one set-based INSERT..SELECT joins everything
            db.exec(`CREATE TABLE scratch.stage (id INTEGER PRIMARY KEY, person_id TEXT, competition_id TEXT, event_id TEXT,
                round_type_id TEXT, pos INTEGER, best INTEGER, average INTEGER, format_id TEXT, rs TEXT, ra TEXT)`);
            db.exec('BEGIN');
            const st = new BatchInserter(db, 'scratch.stage',
                ['id', 'person_id', 'competition_id', 'event_id', 'round_type_id', 'pos', 'best', 'average', 'format_id', 'rs', 'ra'],
                { batch: 150, verb: 'INSERT' });
            await parseTsv(file('results'), {
                signal,
                onProgress: progress('results', APPROX_ROWS.results),
                onHeader: (h) => (cols = buildColumnMap(h, ['id', 'person_id', 'competition_id', 'event_id', 'round_type_id', 'pos', 'best', 'average', 'format_id', 'regional_single_record', 'regional_average_record'])),
                rowFn: (f) => {
                    const id = Number(f[cols.id]);
                    if (!Number.isInteger(id)) throw new Error(`results.tsv: non-integer id "${f[cols.id]}"`);
                    st.add(id, f[cols.person_id], f[cols.competition_id], f[cols.event_id], f[cols.round_type_id],
                        Number(f[cols.pos]), Number(f[cols.best]), Number(f[cols.average]), f[cols.format_id],
                        f[cols.regional_single_record] || null, f[cols.regional_average_record] || null);
                },
            });
            st.flush();
            db.exec('COMMIT');

            // attempts -> scratch. Column order is detected from the data (see attempts-layout.js).
            const findId = db.prepare('SELECT 1 FROM scratch.stage WHERE id = ?');
            const layout = detectAttemptLayout(file('attempts'), (id) => findId.get(id) !== undefined);
            log.info(`result_attempts layout: result_id=col${layout.idCol} attempt_number=col${layout.nCol} value=col${layout.vCol} (${layout.detected})`);
            db.exec('CREATE TABLE scratch.attempts (result_id INTEGER, n INTEGER, v INTEGER)');
            db.exec('BEGIN');
            const att = new BatchInserter(db, 'scratch.attempts', ['result_id', 'n', 'v'], { batch: 300, verb: 'INSERT' });
            let seen = 0;
            let rejected = 0;
            let sample = null;
            let outOfRange = 0;
            let outSample = null;
            await parseTsv(file('attempts'), {
                signal,
                hasHeader: layout.hasHeader,
                onProgress: progress('attempts', APPROX_ROWS.attempts),
                progressEvery: 250_000,
                rowFn: (f) => {
                    seen++;
                    const id = Number(f[layout.idCol]);
                    const n = Number(f[layout.nCol]) + (layout.nBase === 0 ? 1 : 0);
                    const v = Number(f[layout.vCol]);
                    if (!Number.isInteger(id) || !Number.isInteger(n) || !Number.isFinite(v) || n < 1) {
                        rejected++;
                        sample ??= f;
                        return;
                    }
                    if (n > 5) {
                        // Real exports contain stray rows with larger attempt numbers (seen: 38).
                        // They cannot be represented by a1..a5, so skip them and count them.
                        outOfRange++;
                        outSample ??= f;
                        return;
                    }
                    att.add(id, n, v);
                },
            });
            att.flush();
            db.exec('COMMIT');
            if (outOfRange > 0) {
                log.warn(`result_attempts.tsv: skipped ${outOfRange} row(s) with attempt_number > 5, e.g. [${outSample.join(', ')}]`);
            }
            if (seen > 0 && (rejected + outOfRange) / seen > 0.1) {
                throw new Error(
                    `result_attempts.tsv: ${rejected + outOfRange}/${seen} rows unusable; column order probably changed. ` +
                        `Sample: [${(sample || outSample)?.join(', ')}]`,
                );
            }

            // Aggregate once, inside SQLite: result_id -> a1..a5
            this._setStatus({ progress: { label: 'aggregating attempts', done: 0, total: 1 } }, { force: true });
            db.exec(`CREATE TABLE scratch.attempts_agg (result_id INTEGER PRIMARY KEY, a1 INTEGER, a2 INTEGER, a3 INTEGER, a4 INTEGER, a5 INTEGER)`);
            db.exec(`INSERT INTO scratch.attempts_agg
                SELECT result_id,
                       MAX(CASE WHEN n = 1 THEN v END), MAX(CASE WHEN n = 2 THEN v END),
                       MAX(CASE WHEN n = 3 THEN v END), MAX(CASE WHEN n = 4 THEN v END),
                       MAX(CASE WHEN n = 5 THEN v END)
                FROM scratch.attempts GROUP BY result_id ORDER BY result_id`);
            db.exec('DROP TABLE scratch.attempts');

            this._setStatus({ progress: { label: 'joining results', done: 0, total: 1 } }, { force: true });
            db.exec('BEGIN');
            db.exec(`INSERT INTO main.results
                (id, person_id, competition_id, event_id, round_type_id, round_order, comp_date, pos, best, average,
                 format_id, regional_single_record, regional_average_record, a1, a2, a3, a4, a5)
                SELECT s.id, s.person_id, s.competition_id, s.event_id, s.round_type_id,
                       ${ROUND_ORDER_SQL.replaceAll('round_type_id', 's.round_type_id')},
                       COALESCE(c.start_date, 0), s.pos, s.best, s.average, s.format_id, s.rs, s.ra,
                       a.a1, a.a2, a.a3, a.a4, a.a5
                FROM scratch.stage s
                LEFT JOIN main.competitions c ON c.competition_id = s.competition_id
                LEFT JOIN scratch.attempts_agg a ON a.result_id = s.id
                ORDER BY s.id`);
            db.exec('COMMIT');

            // Safety net: nearly every result has attempts. If the join missed (wrong layout, truncated
            // file ...) refuse to publish a database that would answer every average with null.
            const cov = db.prepare('SELECT COUNT(*) AS total, SUM(a1 IS NOT NULL) AS withAttempts FROM main.results').get();
            if (cov.total > 0 && cov.withAttempts / cov.total < 0.9) {
                throw new Error(`Only ${cov.withAttempts}/${cov.total} results have attempts after import; result_attempts.tsv does not match results.tsv`);
            }

            // ranks
            for (const [table, key, label] of [['ranks_single', 'ranksSingle', 'ranks_single'], ['ranks_average', 'ranksAverage', 'ranks_average']]) {
                db.exec('BEGIN');
                const rk = new BatchInserter(db, table, ['person_id', 'event_id', 'best']);
                await parseTsv(file(key), {
                    signal,
                    onProgress: progress(label, APPROX_ROWS.ranks),
                    onHeader: (h) => (cols = buildColumnMap(h, ['person_id', 'event_id', 'best'])),
                    rowFn: (f) => {
                        const best = Number(f[cols.best]);
                        if (f[cols.best] === '' || !Number.isFinite(best)) return;
                        rk.add(f[cols.person_id], f[cols.event_id], best);
                    },
                });
                rk.flush();
                db.exec('COMMIT');
            }

            this._setStatus({ state: 'indexing', progress: { label: 'indexes', done: 0, total: 1 } }, { force: true });
            db.exec(INDEX_EXPORT);
            if (exportDate) db.prepare("INSERT OR REPLACE INTO meta VALUES ('export_date', ?)").run(exportDate);

            const resultCount = db.prepare('SELECT COUNT(*) n FROM results').get().n;
            const personCount = db.prepare('SELECT COUNT(*) n FROM persons').get().n;
            if (resultCount === 0 || personCount === 0) throw new Error('Import produced an empty database; refusing to publish');

            db.exec('DETACH DATABASE scratch');
            db.exec('PRAGMA journal_mode = DELETE');
            db.exec('ANALYZE');
            db.close();
            log.info(`built ${path.basename(outFile)}: ${personCount.toLocaleString()} persons, ${resultCount.toLocaleString()} results`);
            return outFile;
        } catch (err) {
            try {
                db.close();
            } catch {
                /* ignore */
            }
            fs.rmSync(outFile, { force: true });
            throw err;
        } finally {
            fs.rmSync(scratchFile, { force: true });
        }
    }

    /**
     * Download + import + publish. Existing data keeps being served throughout; if anything
     * fails the previous version stays current.
     */
    async refresh({ force = false } = {}) {
        if (this.running) return { skipped: 'already running' };
        this.running = true;
        this.abort = new AbortController();
        const { signal } = this.abort;
        this._setStatus({ refreshing: true, lastError: null }, { force: true });
        const work = path.join(this.dir, 'work');
        try {
            fs.mkdirSync(this.dir, { recursive: true });
            let latest = null;
            let tsvUrl = null;
            if (!force && this.pointer()) {
                const chk = await this.checkForNewerExport(signal);
                if (!chk.needsDownload) return { skipped: 'up to date' };
                latest = chk.latestExportDate;
                tsvUrl = chk.tsvUrl;
            } else {
                const meta = await this.fetchExportMeta(signal);
                latest = meta?.export_date || new Date().toISOString();
                tsvUrl = meta?.tsv_url;
            }
            this._checkDiskSpace();
            fs.rmSync(work, { recursive: true, force: true });
            await this.downloadAndExtract(work, signal, tsvUrl || this.urls.exportTsv);
            this.assertFormatVersion(work);

            const version = `${Date.now()}`;
            const outName = `wca-${version}.db`;
            const partial = path.join(this.dir, `${outName}.partial`);
            await this.buildDatabase(work, partial, { signal, exportDate: latest });
            if (signal.aborted) throw new Error('Refresh cancelled');

            fs.renameSync(partial, path.join(this.dir, outName));
            this._publish(outName, { exportDate: latest, version });
            this._pruneOldVersions(2);
            this._setStatus({ lastSuccessAt: new Date().toISOString() });
            log.info(`published ${outName}`);
            return { published: outName };
        } catch (err) {
            const cancelled = signal.aborted;
            this._setStatus({ lastError: cancelled ? 'cancelled' : err.message });
            if (!cancelled) log.error('refresh failed (previous data stays live):', err.message);
            throw err;
        } finally {
            fs.rmSync(work, { recursive: true, force: true });
            for (const f of fs.readdirSync(this.dir)) if (f.endsWith('.partial') || f.endsWith('.scratch')) fs.rmSync(path.join(this.dir, f), { force: true });
            this.running = false;
            this.abort = null;
            this._setStatus({ refreshing: false, state: 'idle', progress: null }, { force: true });
        }
    }

    // ── upcoming competitions (live.db) ─────────────────────────────────────

    async syncCompetitions({ maxAgeMs = 60 * 60 * 1000, force = false, lookaheadDays = 365 } = {}) {
        fs.mkdirSync(this.dir, { recursive: true });
        const db = new DatabaseSync(path.join(this.dir, 'live.db'));
        try {
            db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
            db.exec(SCHEMA_LIVE);
            const row = db.prepare("SELECT value FROM meta WHERE key = 'competitions_sync_date'").get();
            if (!force && row && Date.now() - new Date(row.value).getTime() < maxAgeMs) return { skipped: true };

            const iso = (d) => d.toISOString().slice(0, 10);
            const start = iso(new Date());
            const end = iso(new Date(Date.now() + lookaheadDays * 24 * 60 * 60 * 1000));
            const all = [];
            for (let page = 1; ; page++) {
                const { data } = await this.http.get(this.urls.competitions, { params: { start, end, page }, timeout: 30_000 });
                if (!Array.isArray(data) || data.length === 0) break;
                all.push(...data);
                if (data.length < 25) break;
            }
            db.exec('BEGIN');
            const ins = new BatchInserter(db, 'competitions', ['competition_id', 'name', 'country_id', 'start_date', 'end_date']);
            for (const c of all) ins.add(c.id, c.name, c.country_iso2, toDateInt(c.start_date), toDateInt(c.end_date));
            ins.flush();
            db.prepare('DELETE FROM competitions WHERE end_date < ?').run(toDateInt(new Date(Date.now() - 14 * 864e5).toISOString()));
            db.prepare("INSERT OR REPLACE INTO meta VALUES ('competitions_sync_date', ?)").run(new Date().toISOString());
            db.exec('COMMIT');
            log.info(`synced ${all.length} competitions`);
            return { count: all.length };
        } catch (err) {
            try {
                db.exec('ROLLBACK');
            } catch {
                /* not in a transaction */
            }
            log.warn('competition sync failed:', err.message);
            return { error: err.message };
        } finally {
            db.close();
        }
    }
}
