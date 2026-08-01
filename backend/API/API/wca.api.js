import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createWriteStream, createReadStream } from 'fs';
import { Extract } from 'unzipper';
import { Transform } from 'stream';
import { DatabaseSync } from 'node:sqlite';

// ─────────────────────────────────────────────────────────────────────────────
// WcaApi
//
// Historical person/results data is served from a local SQLite database that is
// populated on first run from the official WCA TSV export and refreshed when the
// WCA publishes a newer export (checked at most once per week).
//
// Competition data is also stored locally in SQLite. Future/upcoming competitions
// are synced from the network API on initialization and periodically refreshed,
// then all competition queries use only the local database.
//
// Benefits over pure in-memory indexes:
//   • Zero startup cost after first import — the DB file survives restarts.
//   • ~90 % lower RAM — only the rows for the requested WCA ID are loaded.
//   • Incremental re-import — on a new export only changed/new rows are written
//     (INSERT OR REPLACE); unchanged rows are a cheap no-op in SQLite.
//   • Crash-safe — the import runs inside a single transaction; a partial import
//     leaves the old data intact.
//
// WCA Live data still uses the network API because it covers events not yet in
// the export and live scoring.
// ─────────────────────────────────────────────────────────────────────────────

export default class WcaApi {
    constructor(options = {}) {
        // ── Network endpoints ─────────────────────────────────────────────────
        this.competitionsUrl = 'https://www.worldcubeassociation.org/api/v0/competitions';
        this.wcaLiveUrl = 'https://live.worldcubeassociation.org/api';
        this.exportMetaUrl = 'https://www.worldcubeassociation.org/api/v0/export/public';
        this.exportTsvUrl = 'https://www.worldcubeassociation.org/export/results/v2/tsv';

        // ── Storage paths ─────────────────────────────────────────────────────
        this.exportDir = options.exportDir || path.join(process.cwd(), 'wca_export');
        this.dbPath = options.dbPath || path.join(this.exportDir, 'wca.db');

        // How old the stored export_date may be before we re-check with the WCA.
        this.exportMaxAgeMs = 7 * 24 * 60 * 60 * 1000; // 1 week

        // How old the stored competitions_sync_date may be before we re-sync
        this.competitionsSyncMaxAgeMs = 1 * 60 * 60 * 1000; // 1 hour

        // ── SQLite handle ─────────────────────────────────────────────────────
        // Opened lazily on first use; kept open for the lifetime of the instance.
        this._db = null;

        // True only after the DB is open AND fully populated.
        // _db is set as soon as the file is opened (before import); callers must
        // check _ready, not _db, to know whether queries are safe.
        this._ready = false;

        // Promise guard so concurrent callers share a single initialisation.
        this._initPromise = null;

        // ── Network response caches (WCIF / live) ──────────────────────────────
        // Competitions are now stored in DB, so no cache needed for them
        this.cacheTtlMs = 5 * 60 * 1000;
        this.wcifCacheTtlMs = 2 * 60 * 1000;
        this.responseCache = new Map();

        // ── Concurrency cap for bulk profile builds ───────────────────────────
        this.maxConcurrentPersonFetches = 20;

        // ── Per-competition analysis cache ────────────────────────────────────
        // Keyed by competitionId → Map<"${wcaId}:${eventId}", profile|null>.
        // Profiles survive for the lifetime of the server process so repeated
        // calls to different rounds of the same competition never re-fetch
        // competitor histories.
        this.compProfileCache = new Map();

        // Controller used to cancel a manual export refresh.
        this._refreshAbortController = null;

        // Background refresh loop for periodic WCA export checks/imports.
        this._backgroundRefreshStarted = false;
        this._backgroundRefreshTimer = null;
        this._backgroundRefreshInterval = null;
        this._backgroundRefreshInitialDelayMs = 2 * 60 * 1000; // 2 minutes
        this._backgroundRefreshIntervalMs = 24 * 60 * 60 * 1000; // 24 hours
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SQLite schema & helpers
    // ═══════════════════════════════════════════════════════════════════════

    _openDbPath(dbPath) {
        fs.mkdirSync(this.exportDir, { recursive: true });
        const db = new DatabaseSync(dbPath);

        db.exec('PRAGMA journal_mode = WAL');
        db.exec('PRAGMA synchronous  = NORMAL'); // safe with WAL
        db.exec('PRAGMA foreign_keys = OFF');
        db.exec('PRAGMA temp_store   = MEMORY');
        db.exec('PRAGMA cache_size   = -65536'); // ~64 MB page cache

        db.exec(`
            CREATE TABLE IF NOT EXISTS meta (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            -- One row per WCA competitor (canonical / latest sub_id).
            CREATE TABLE IF NOT EXISTS persons (
                wca_id     TEXT PRIMARY KEY,
                name       TEXT NOT NULL,
                country_id TEXT NOT NULL
            );

            -- One row per result (competition x event x round x person).
            -- Attempts are packed as a little-endian Int32 blob
            -- (4 bytes x up to 5 attempts = max 20 bytes) to avoid a join.
            CREATE TABLE IF NOT EXISTS results (
                result_id               TEXT PRIMARY KEY,
                person_id               TEXT NOT NULL,
                competition_id          TEXT NOT NULL,
                event_id                TEXT NOT NULL,
                round_type_id           TEXT NOT NULL,
                pos                     INTEGER NOT NULL,
                best                    INTEGER NOT NULL,
                average                 INTEGER NOT NULL,
                format_id               TEXT NOT NULL,
                regional_single_record  TEXT,
                regional_average_record TEXT,
                attempts                BLOB NOT NULL
            );

            -- Best single / average per person x event (for personal records).
            CREATE TABLE IF NOT EXISTS ranks_single (
                person_id TEXT NOT NULL,
                event_id  TEXT NOT NULL,
                best      INTEGER NOT NULL,
                PRIMARY KEY (person_id, event_id)
            );
            CREATE TABLE IF NOT EXISTS ranks_average (
                person_id TEXT NOT NULL,
                event_id  TEXT NOT NULL,
                best      INTEGER NOT NULL,
                PRIMARY KEY (person_id, event_id)
            );

            -- Competitions from both export and network API
            CREATE TABLE IF NOT EXISTS competitions (
                competition_id TEXT PRIMARY KEY,
                name           TEXT NOT NULL,
                country_id     TEXT NOT NULL,
                year           INTEGER NOT NULL,
                month          INTEGER NOT NULL,
                day            INTEGER NOT NULL,
                end_year       INTEGER NOT NULL,
                end_month      INTEGER NOT NULL,
                end_day        INTEGER NOT NULL,
                source         TEXT DEFAULT 'export'
            );
        `);

        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_results_person_event
                ON results (person_id, event_id);
            
            CREATE INDEX IF NOT EXISTS idx_competitions_dates
                ON competitions (year, month, day);
        `);

        return db;
    }

    _openDb() {
        return this._openDbPath(this.dbPath);
    }

    _closeDb() {
        if (!this._db) return;
        try {
            this._db.close();
        } catch {
            // best effort
        }
        this._db = null;
        this._ready = false;
    }

    _isCorruptError(err) {
        if (!err) return false;
        const msg = String(err.message || '').toLowerCase();
        return (
            msg.includes('malformed') ||
            msg.includes('database disk image is malformed') ||
            err.code === 'SQLITE_CORRUPT' ||
            err.errcode === 11
        );
    }

    // Pack an array of attempt integers into a compact little-endian Buffer.
    _packAttempts(arr) {
        const buf = Buffer.alloc(arr.length * 4);
        arr.forEach((v, i) => buf.writeInt32LE(v, i * 4));
        return buf;
    }

    // Unpack a BLOB back to a plain number array.
    // node:sqlite returns BLOBs as Uint8Array, so we wrap in Buffer.from()
    // before using readInt32LE.
    _unpackAttempts(buf) {
        if (!buf || buf.length === 0) return [];
        const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
        const out = [];
        for (let i = 0; i < b.length; i += 4) out.push(b.readInt32LE(i));
        return out;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Competition syncing from network API to local DB
    // ═══════════════════════════════════════════════════════════════════════

    _storedCompetitionsSyncDate() {
        if (!this._db) return null;
        try {
            const row = this._db
                .prepare("SELECT value FROM meta WHERE key = 'competitions_sync_date'")
                .get();
            return row ? row.value : null;
        } catch {
            return null;
        }
    }

    _saveCompetitionsSyncDate(dateStr) {
        this._db
            .prepare("INSERT OR REPLACE INTO meta VALUES ('competitions_sync_date', ?)")
            .run(dateStr);
    }

    async _syncCompetitionsFromNetwork(signal = null) {
        const stored = this._storedCompetitionsSyncDate();

        // Check if we need to sync (check every hour)
        if (stored) {
            const storedMs = new Date(stored).getTime();
            if (Date.now() - storedMs < this.competitionsSyncMaxAgeMs) {
                return; // Recently synced, skip
            }
        }

        try {
            console.log('[WcaApi] Syncing upcoming competitions from network...');

            const today = new Date().toISOString().slice(0, 10);
            const ninetyDaysOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
                .toISOString()
                .slice(0, 10);

            const allComps = [];
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                if (signal?.aborted) throw new Error('Refresh cancelled');
                const params = new URLSearchParams({
                    start: today,
                    end: ninetyDaysOut,
                    page,
                });

                const { data } = await axios.get(`${this.competitionsUrl}?${params}`, {
                    timeout: 30_000,
                    signal,
                });

                if (!Array.isArray(data) || data.length === 0) {
                    hasMore = false;
                } else {
                    allComps.push(...data);
                    hasMore = data.length === 25; // WCA API returns max 25 per page
                    page++;
                }
            }

            if (signal?.aborted) throw new Error('Refresh cancelled');
            // Save to database
            this._saveCompetitionsToDb(allComps);
            this._saveCompetitionsSyncDate(new Date().toISOString());

            console.log(`[WcaApi] Synced ${allComps.length} competitions from network.`);
        } catch (err) {
            if (signal?.aborted) throw err;
            console.warn('[WcaApi] Failed to sync competitions from network:', err.message);
            // Don't throw — DB may have stale data but it's better than failing
        }
    }

    _saveCompetitionsToDb(networkComps) {
        const insComp = this._db.prepare(`
            INSERT OR REPLACE INTO competitions
                (competition_id, name, country_id, year, month, day, end_year, end_month, end_day, source)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        `);

        const updateStmt = this._db.prepare('BEGIN');
        updateStmt.run();

        try {
            for (const comp of networkComps) {
                const start = comp.start_date.split('-').map(Number);
                const end = comp.end_date.split('-').map(Number);

                insComp.run(
                    comp.id, // competition_id
                    comp.name, // name
                    comp.country_iso2, // country_id
                    start[0], // year
                    start[1], // month
                    start[2], // day
                    end[0], // end_year
                    end[1], // end_month
                    end[2], // end_day
                    'api', // source
                );
            }
            this._db.prepare('COMMIT').run();
        } catch (err) {
            this._db.prepare('ROLLBACK').run();
            throw err;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Export download & TSV streaming parser
    // ═══════════════════════════════════════════════════════════════════════

    _exportPath(filename) {
        return path.join(this.exportDir, filename);
    }

    _storedExportDate() {
        if (!this._db) return null;
        try {
            const row = this._db.prepare("SELECT value FROM meta WHERE key = 'export_date'").get();
            return row ? row.value : null;
        } catch {
            return null;
        }
    }

    _saveExportDate(dateStr) {
        this._db.prepare("INSERT OR REPLACE INTO meta VALUES ('export_date', ?)").run(dateStr);
    }

    async _checkForNewerExport(signal = null) {
        const stored = this._storedExportDate();

        if (stored) {
            const storedMs = new Date(stored).getTime();
            if (Date.now() - storedMs < this.exportMaxAgeMs) {
                return { needsDownload: false, latestExportDate: stored };
            }
        }

        try {
            const { data } = await axios.get(this.exportMetaUrl, {
                timeout: 10_000,
                signal,
            });
            const latestExportDate = data.export_date;

            if (!stored || latestExportDate !== stored) {
                return { needsDownload: true, latestExportDate };
            }
            // Up to date — bump stored date so we skip the check for another week.
            this._saveExportDate(latestExportDate);
            return { needsDownload: false, latestExportDate };
        } catch (err) {
            if (signal?.aborted) throw new Error('Refresh cancelled');
            console.warn('[WcaApi] Could not reach export metadata endpoint:', err.message);
            return { needsDownload: false, latestExportDate: stored };
        }
    }

    async _checkDiskSpace() {
        try {
            const stat = fs.statfsSync(this.exportDir);
            const freeBytes = stat.bfree * stat.bsize;
            const requiredBytes = 4 * 1024 * 1024 * 1024; // 4 GB headroom
            if (freeBytes < requiredBytes) {
                throw new Error(
                    `Insufficient disk space for WCA export. ` +
                        `Required: ~4 GB, Available: ${(freeBytes / 1024 ** 3).toFixed(1)} GB. ` +
                        `Free up space or set exportDir to a larger volume.`,
                );
            }
        } catch (err) {
            if (err.message.includes('Insufficient')) throw err;
            // statfsSync not available on all platforms — skip check
            console.warn('[WcaApi] Could not check disk space:', err.message);
        }
    }

    async _downloadAndExtract(signal = null) {
        fs.mkdirSync(this.exportDir, { recursive: true });
        await this._checkDiskSpace();
        if (signal?.aborted) throw new Error('Refresh cancelled');

        const zipPath = this._exportPath('wca_export.tsv.zip');

        console.log('[WcaApi] Downloading WCA TSV export...');
        const response = await axios.get(this.exportTsvUrl, {
            responseType: 'stream',
            timeout: 10 * 60 * 1000,
            signal,
        });

        const abortHandler = () => {
            response.data.destroy(new Error('Refresh cancelled'));
        };
        signal?.addEventListener('abort', abortHandler, { once: true });
        try {
            await pipeline(response.data, createWriteStream(zipPath), { signal });
        } finally {
            signal?.removeEventListener('abort', abortHandler);
        }

        if (signal?.aborted) throw new Error('Refresh cancelled');
        console.log('[WcaApi] Download complete. Extracting...');

        await new Promise((resolve, reject) => {
            const extractor = Extract({ path: this.exportDir });
            const abortHandler2 = () => extractor.destroy(new Error('Refresh cancelled'));
            signal?.addEventListener('abort', abortHandler2, { once: true });

            createReadStream(zipPath)
                .pipe(extractor)
                .on('close', () => {
                    signal?.removeEventListener('abort', abortHandler2);
                    resolve();
                })
                .on('error', (err) => {
                    signal?.removeEventListener('abort', abortHandler2);
                    reject(err);
                });
        });

        if (signal?.aborted) throw new Error('Refresh cancelled');
        fs.unlinkSync(zipPath);
        console.log('[WcaApi] Extraction complete.');
    }

    // Add this to be called after _importExport() completes
    _cleanupTsvFiles() {
        const tsvFiles = [
            'WCA_export_persons.tsv',
            'WCA_export_results.tsv',
            'WCA_export_result_attempts.tsv',
            'WCA_export_ranks_single.tsv',
            'WCA_export_ranks_average.tsv',
            'WCA_export_competitions.tsv',
        ];
        for (const f of tsvFiles) {
            const p = this._exportPath(f);
            try {
                if (fs.existsSync(p)) fs.unlinkSync(p);
            } catch (err) {
                console.warn(`[WcaApi] Could not delete ${f}:`, err.message);
            }
        }
        console.log('[WcaApi] TSV files cleaned up.');
    }

    // Stream-parse a TSV file, calling rowFn(fields) for every data row.
    //
    // Uses a manual Transform rather than readline because readline's
    // `for await` iterator silently stops on large files under backpressure
    // (observed on Node >= 22). This resolves only on the 'finish' event,
    // which fires only after _flush() completes — it cannot silently truncate.
    //
    // onProgress(rowsProcessed) is called every PROGRESS_INTERVAL rows.
    _parseTsv(filePath, rowFn, onProgress = null, signal = null) {
        const PROGRESS_INTERVAL = 10_000;

        // Only result_attempts.tsv has no header, all others do
        const skipHeader = !/WCA_export_result_attempts.tsv$/.test(filePath);

        return new Promise((resolve, reject) => {
            const decoder = new TextDecoder('utf-8');
            let remainder = '';
            let headerSkipped = false;
            let rowCount = 0;

            const transform = new Transform({
                readableObjectMode: false,
                writableObjectMode: false,

                transform(chunk, _enc, cb) {
                    if (signal?.aborted) {
                        return cb(new Error('Refresh cancelled'));
                    }
                    remainder += decoder.decode(chunk, { stream: true });
                    let start = 0;
                    let nl;
                    while ((nl = remainder.indexOf('\n', start)) !== -1) {
                        const end = nl > start && remainder[nl - 1] === '\r' ? nl - 1 : nl;
                        const line = remainder.slice(start, end);
                        start = nl + 1;
                        if (!line) continue;
                        const fields = line.split('\t');
                        if (skipHeader && !headerSkipped) {
                            headerSkipped = true;
                            continue;
                        }
                        try {
                            rowFn(fields);
                        } catch (e) {
                            return cb(e);
                        }
                        rowCount++;
                        if (onProgress && rowCount % PROGRESS_INTERVAL === 0) {
                            onProgress(rowCount);
                        }
                    }
                    remainder = remainder.slice(start);
                    cb();
                },

                flush(cb) {
                    if (signal?.aborted) {
                        return cb(new Error('Refresh cancelled'));
                    }
                    const line = remainder.endsWith('\r') ? remainder.slice(0, -1) : remainder;
                    if (line) {
                        const fields = line.split('\t');
                        if (skipHeader && !headerSkipped) {
                            headerSkipped = true;
                        } else {
                            try {
                                rowFn(fields);
                                rowCount++;
                            } catch (e) {
                                return cb(e);
                            }
                        }
                    }
                    remainder = '';
                    cb();
                },
            });

            const abortHandler = () => transform.destroy(new Error('Refresh cancelled'));
            signal?.addEventListener('abort', abortHandler, { once: true });
            const cleanup = () => signal?.removeEventListener('abort', abortHandler);

            transform.on('finish', () => {
                cleanup();
                resolve(rowCount);
            });
            transform.on('error', (err) => {
                cleanup();
                reject(err);
            });
            const src = createReadStream(filePath);
            src.on('error', (err) => {
                cleanup();
                reject(err);
            });
            src.pipe(transform);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Database import
    //
    // All four TSV files are imported inside a single SQLite transaction so a
    // partial import leaves the existing data intact.
    //
    // INSERT OR REPLACE means rows that haven't changed are overwritten with
    // identical data (cheap), while new/changed rows are updated.  On a weekly
    // re-import the vast majority of rows are unchanged, so the incremental
    // cost is mostly I/O-bound TSV parsing — not full index rebuilding.
    // ═══════════════════════════════════════════════════════════════════════

    async _importExport(signal = null, db = this._db) {
        const effectiveDb = db;

        // Use disk for temp tables during import to avoid memory pressure
        effectiveDb.exec('PRAGMA temp_store = FILE');

        // ── Progress bar helpers ──────────────────────────────────────────────
        const BAR_WIDTH = 40;
        let totalRowsImported = 0;

        const APPROX_ROWS = {
            competitions: 30_000,
            persons: 250_000,
            result_attempts: 29_910_000,
            results: 6_510_000,
            ranks_single: 610_000,
            ranks_average: 550_000,
        };

        const renderBar = (label, done, total) => {
            const pct = Math.min(done / total, 1);
            const filled = Math.round(pct * BAR_WIDTH);
            const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(BAR_WIDTH - filled);
            const pctStr = (pct * 100).toFixed(1).padStart(5);
            const mRows = (done / 1_000_000).toFixed(2);
            process.stdout.write(
                `\r[WcaApi] ${label.padEnd(18)} [${bar}] ${pctStr}%  ${mRows}M rows`,
            );
        };

        const finishStep = (label, rowCount) => {
            totalRowsImported += rowCount;
            renderBar(label, rowCount, rowCount);
            process.stdout.write('\n');
        };

        console.log('[WcaApi] Importing TSV export into SQLite...');

        // ── Transaction 1: competitions + persons + result_attempts ──────────
        db.exec('BEGIN');
        try {
            // 0. competitions
            const insComp = db.prepare(
                `INSERT OR REPLACE INTO competitions
                    (competition_id, name, country_id, year, month, day, end_year, end_month, end_day, source)
                 VALUES (?,?,?,?,?,?,?,?,?,?)`,
            );
            let compRows = 0;
            await this._parseTsv(
                this._exportPath('WCA_export_competitions.tsv'),
                (f) => {
                    // id(0) name(1) country_id(6) year(14) month(15) day(16)
                    // end_year(17) end_month(18) end_day(19)
                    insComp.run(
                        f[0], // competition_id
                        f[1], // name
                        f[6], // country_id
                        Number(f[14]), // year
                        Number(f[15]), // month
                        Number(f[16]), // day
                        Number(f[17]), // end_year
                        Number(f[18]), // end_month
                        Number(f[19]), // end_day
                        'export', // source
                    );
                    compRows++;
                },
                (n) => renderBar('competitions', n, APPROX_ROWS.competitions),
                signal,
            );
            finishStep('competitions', compRows);

            // 1. persons
            const insPerson = db.prepare(
                'INSERT OR REPLACE INTO persons (wca_id, name, country_id) VALUES (?,?,?)',
            );
            let personRows = 0;
            await this._parseTsv(
                this._exportPath('WCA_export_persons.tsv'),
                (f) => {
                    // name(0) gender(1) wca_id(2) sub_id(3) country_id(4)
                    insPerson.run(f[2], f[0], f[4]);
                    personRows++;
                },
                (n) => renderBar('persons', n, APPROX_ROWS.persons),
                signal,
            );
            finishStep('persons', personRows);

            // 2. result_attempts → temp table instead of in-memory Map
            db.exec(`
                CREATE TEMP TABLE IF NOT EXISTS temp_attempts (
                    result_id      TEXT    NOT NULL,
                    attempt_number INTEGER,
                    value          INTEGER
                )
            `);

            const insAttempt = db.prepare(
                'INSERT INTO temp_attempts (result_id, attempt_number, value) VALUES (?,?,?)',
            );
            let attemptRows = 0;
            await this._parseTsv(
                this._exportPath('WCA_export_result_attempts.tsv'),
                (f) => {
                    // value(0) attempt_number(1) result_id(2)
                    const result_id = f[2]?.trim();
                    const attempt_number = Number(f[1]);
                    const value = Number(f[0]);

                    // Skip malformed rows
                    if (!result_id || !Number.isFinite(attempt_number) || !Number.isFinite(value))
                        return;

                    insAttempt.run(result_id, attempt_number, value);
                    attemptRows++;
                },
                (n) => renderBar('result_attempts', n, APPROX_ROWS.result_attempts),
                signal,
            );
            finishStep('result_attempts', attemptRows);

            db.exec('COMMIT');
        } catch (err) {
            db.exec('ROLLBACK');
            throw err;
        }

        // ── Index build — outside any transaction ─────────────────────────────
        // No write lock is held on the main DB here, so WAL readers can still
        // serve queries while this blocks the event loop.
        process.stdout.write('[WcaApi] Building temp_attempts index ');
        let dots = 0;
        const dotInterval = setInterval(() => {
            process.stdout.write('.');
            dots++;
        }, 500);
        db.exec('CREATE INDEX temp_attempts_idx ON temp_attempts (result_id)');
        clearInterval(dotInterval);
        process.stdout.write(
            '\r' + ' '.repeat('[WcaApi] Building temp_attempts index '.length + dots) + '\r',
        );
        console.log('[WcaApi] Index built.');

        // ── Transaction 2: results + ranks ────────────────────────────────────
        db.exec('BEGIN');
        try {
            // 3. results — join attempts from temp table
            const insResult = db.prepare(`
                INSERT OR REPLACE INTO results
                    (result_id, person_id, competition_id, event_id, round_type_id,
                     pos, best, average, format_id,
                     regional_single_record, regional_average_record, attempts)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            `);

            const getAttempts = db.prepare(`
                SELECT value FROM temp_attempts
                WHERE  result_id = ?
                  AND  attempt_number IS NOT NULL
                ORDER  BY attempt_number ASC
            `);

            let resultRows = 0;
            await this._parseTsv(
                this._exportPath('WCA_export_results.tsv'),
                (f) => {
                    // id(0) pos(1) best(2) average(3) competition_id(4) round_type_id(5)
                    // event_id(6) person_name(7) person_id(8) format_id(9)
                    // regional_single_record(10) regional_average_record(11)
                    const attempts = getAttempts.all(f[0]).map((r) => r.value);
                    const packed = this._packAttempts(attempts);
                    insResult.run(
                        f[0], // result_id
                        f[8], // person_id
                        f[4], // competition_id
                        f[6], // event_id
                        f[5], // round_type_id
                        Number(f[1]), // pos
                        Number(f[2]), // best
                        Number(f[3]), // average
                        f[9], // format_id
                        f[10] || null, // regional_single_record
                        f[11] || null, // regional_average_record
                        packed,
                    );
                    resultRows++;
                },
                (n) => renderBar('results', n, APPROX_ROWS.results),
                signal,
            );
            finishStep('results', resultRows);

            // 4. ranks_single / ranks_average
            for (const [table, filename, approx] of [
                ['ranks_single', 'WCA_export_ranks_single.tsv', APPROX_ROWS.ranks_single],
                ['ranks_average', 'WCA_export_ranks_average.tsv', APPROX_ROWS.ranks_average],
            ]) {
                const insRank = db.prepare(
                    `INSERT OR REPLACE INTO ${table} (person_id, event_id, best) VALUES (?,?,?)`,
                );
                let rankRows = 0;
                await this._parseTsv(
                    this._exportPath(filename),
                    (f) => {
                        // best(0) person_id(1) event_id(2) world_rank(3) ...
                        if (!f[0] || isNaN(Number(f[0]))) return;
                        insRank.run(f[1], f[2], Number(f[0]));
                        rankRows++;
                    },
                    (n) => renderBar(table, n, approx),
                    signal,
                );
                finishStep(table, rankRows);
            }

            db.exec('COMMIT');
        } catch (err) {
            db.exec('ROLLBACK');
            // Drop temp table before re-throwing so a retry starts clean
            db.exec('DROP TABLE IF EXISTS temp_attempts');
            throw err;
        }

        // Temp table no longer needed — free the disk space
        db.exec('DROP TABLE IF EXISTS temp_attempts');

        // Restore normal temp store now that import is done
        db.exec('PRAGMA temp_store = MEMORY');

        console.log(
            `[WcaApi] Import complete. Total rows written: ${totalRowsImported.toLocaleString()}`,
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Initialisation — called lazily before any DB access
    // ═══════════════════════════════════════════════════════════════════════

    async _ensureReady() {
        if (this._ready) return;
        if (this._initPromise) return this._initPromise;

        this._initPromise = (async () => {
            try {
                try {
                    this._db = this._openDb();
                } catch (err) {
                    if (this._isCorruptError(err)) {
                        console.warn(
                            '[WcaApi] Corrupt DB detected, rebuilding from scratch:',
                            err.message,
                        );
                        this._closeDb();
                        try {
                            fs.unlinkSync(this.dbPath);
                        } catch {
                            // ignore
                        }
                        this._db = this._openDb();
                    } else {
                        throw err;
                    }
                }

                const { needsDownload, latestExportDate } = await this._checkForNewerExport();

                if (needsDownload) {
                    await this._downloadAndExtract();
                    await this._importExport();
                    this._cleanupTsvFiles();
                    if (latestExportDate) this._saveExportDate(latestExportDate);
                } else {
                    // DB already populated — TSVs are gone after first import, that's fine
                    const hasData =
                        this._db.prepare('SELECT COUNT(*) as n FROM persons').get().n > 0;
                    if (!hasData) {
                        // Genuinely first run or DB was wiped — need to download
                        await this._downloadAndExtract();
                        await this._importExport();
                        this._cleanupTsvFiles();
                        if (latestExportDate) this._saveExportDate(latestExportDate);
                    }
                    // else: DB is populated and export is current — nothing to do
                }

                // Sync upcoming competitions from network API
                await this._syncCompetitionsFromNetwork();

                this._ready = true;
            } catch (err) {
                this._initPromise = null;
                throw err;
            }
        })();

        await this._initPromise;
        this._initPromise = null;
    }

    startBackgroundRefreshLoop() {
        if (this._backgroundRefreshStarted) return;

        this._backgroundRefreshStarted = true;

        this._backgroundRefreshTimer = setTimeout(() => {
            this._runBackgroundRefresh().catch((err) => {
                console.error('[WcaApi] Background refresh failed:', err.message);
            });
        }, this._backgroundRefreshInitialDelayMs);

        this._backgroundRefreshInterval = setInterval(() => {
            this._runBackgroundRefresh().catch((err) => {
                console.error('[WcaApi] Background refresh failed:', err.message);
            });
        }, this._backgroundRefreshIntervalMs);
    }

    async _runBackgroundRefresh() {
        if (this._initPromise || this._refreshAbortController) {
            return;
        }

        try {
            console.log('[WcaApi] Running scheduled background refresh...');
            await this.forceRefreshExport();
        } catch (err) {
            console.error('[WcaApi] Background refresh failed during initialization:', err.message);
        }
    }

    stopBackgroundRefreshLoop() {
        if (this._backgroundRefreshTimer) {
            clearTimeout(this._backgroundRefreshTimer);
            this._backgroundRefreshTimer = null;
        }
        if (this._backgroundRefreshInterval) {
            clearInterval(this._backgroundRefreshInterval);
            this._backgroundRefreshInterval = null;
        }
        this._backgroundRefreshStarted = false;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Cache helpers  (for network-backed endpoints)
    // ═══════════════════════════════════════════════════════════════════════

    normalizeWcaId(wcaId) {
        return String(wcaId || '')
            .trim()
            .toUpperCase();
    }

    isValidWcaId(wcaId) {
        return /^[0-9]{4}[A-Z]{4}[0-9]{2}$/.test(wcaId);
    }

    pruneExpiredCache() {
        const now = Date.now();
        for (const [key, entry] of this.responseCache.entries()) {
            if (!entry.promise && entry.expiresAt <= now) this.responseCache.delete(key);
        }
    }

    async forceRefreshExport() {
        console.log('[WcaApi] Force refresh requested — re-downloading WCA export...');

        const controller = new AbortController();
        this._refreshAbortController = controller;

        // Pause any new queries during refresh
        this._ready = false;
        this._initPromise = (async () => {
            try {
                // Clean up any leftover TSVs from a previous failed run
                this._cleanupTsvFiles();

                await this._checkDiskSpace();
                await this._downloadAndExtract(controller.signal);

                // Import into a temporary DB first, then swap it into place only
                // after a successful import. This avoids leaving a corrupt or partial
                // database file behind if the refresh fails mid-run.
                const tempDbPath = `${this.dbPath}.tmp`;
                try {
                    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
                } catch {
                    // ignore unlink errors
                }

                const tempDb = this._openDbPath(tempDbPath);
                try {
                    await this._importExport(controller.signal, tempDb);
                    tempDb.close();

                    if (this._db) {
                        try {
                            this._db.close();
                        } catch {
                            // ignore close errors
                        }
                        this._db = null;
                    }

                    try {
                        if (fs.existsSync(this.dbPath)) fs.unlinkSync(this.dbPath);
                    } catch {
                        // ignore unlink errors
                    }
                    fs.renameSync(tempDbPath, this.dbPath);
                    this._db = this._openDb();
                } catch (err) {
                    try {
                        tempDb.close();
                    } catch {
                        // ignore close errors
                    }
                    try {
                        if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
                    } catch {
                        // ignore cleanup errors
                    }
                    throw err;
                }
                this._cleanupTsvFiles();

                const { latestExportDate } = await this._checkForNewerExport(controller.signal);
                if (latestExportDate) this._saveExportDate(latestExportDate);

                // Re-sync competitions after export refresh
                await this._syncCompetitionsFromNetwork(controller.signal);

                this._ready = true;
                console.log('[WcaApi] Force refresh complete.');
            } catch (err) {
                // Leave _ready false so the next request retries properly
                this._initPromise = null;
                throw err;
            } finally {
                this._refreshAbortController = null;
            }
        })();

        try {
            await this._initPromise;
        } finally {
            this._initPromise = null;
        }
    }

    async _cachedFetch(cacheKey, fetchFn, ttlMs = this.cacheTtlMs) {
        const now = Date.now();
        this.pruneExpiredCache();

        const entry = this.responseCache.get(cacheKey);
        if (entry) {
            if (entry.promise) return entry.promise;
            if (entry.expiresAt > now) return entry.data;
            this.responseCache.delete(cacheKey);
        }

        const promise = fetchFn()
            .then((data) => {
                this.responseCache.set(cacheKey, { data, expiresAt: Date.now() + ttlMs });
                return data;
            })
            .catch((err) => {
                this.responseCache.delete(cacheKey);
                throw err;
            });

        this.responseCache.set(cacheKey, { data: null, expiresAt: 0, promise });
        return promise;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Concurrency
    // ═══════════════════════════════════════════════════════════════════════

    async _pooled(tasks, concurrency = this.maxConcurrentPersonFetches) {
        const results = new Array(tasks.length);
        let index = 0;

        async function worker() {
            while (index < tasks.length) {
                const i = index++;
                try {
                    results[i] = await tasks[i]();
                } catch (err) {
                    results[i] = { error: err.message };
                }
            }
        }

        await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
        return results;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Utility
    // ═══════════════════════════════════════════════════════════════════════

    filterAttempts(attempts) {
        return attempts.filter((a) => a !== 0);
    }

    isOngoing(competition) {
        const today = new Date().toISOString().slice(0, 10);
        return competition.start_date <= today && today <= competition.end_date;
    }

    isFuture(competition) {
        const today = new Date().toISOString().slice(0, 10);
        return competition.start_date > today;
    }

    centisecondsToSeconds(cs) {
        if (cs === null || cs <= 0) return null;
        return cs / 100;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Person / competitor data  — served from SQLite
    // ═══════════════════════════════════════════════════════════════════════

    // Returns { name, personalRecords, results } — same shape as the original
    // API-backed version.  All data is read from the local SQLite DB.
    async fetchCompetitorData(wcaId) {
        await this._ensureReady();

        const id = this.normalizeWcaId(wcaId);

        const person = this._db.prepare('SELECT name FROM persons WHERE wca_id = ?').get(id);
        if (!person) {
            // Debug: try a LIKE query to see if similar IDs exist
            try {
                const similar = this._db
                    .prepare('SELECT wca_id FROM persons WHERE wca_id LIKE ?')
                    .all(`%${id.slice(2, -2)}%`);
                console.log(
                    `[WcaApi][DEBUG] Similar wca_id values for pattern '%${id.slice(2, -2)}%':`,
                    similar.map((r) => r.wca_id),
                );
            } catch (e) {
                console.warn('[WcaApi][DEBUG] Could not fetch similar wca_id values:', e);
            }
            throw new Error(`WCA ID not found in export: ${id}`);
        }

        const rows = this._db
            .prepare(
                `
            SELECT r.competition_id, r.event_id, r.round_type_id, r.pos,
                   r.best, r.average, r.format_id,
                   r.regional_single_record, r.regional_average_record,
                   r.attempts,
                   c.year, c.month, c.day
            FROM   results r
            LEFT JOIN competitions c USING (competition_id)
            WHERE  r.person_id = ?
        `,
            )
            .all(id);

        const results = rows
            .map((r) => ({
                competition_id: r.competition_id,
                event_id: r.event_id,
                round_type_id: r.round_type_id,
                pos: r.pos,
                best: r.best,
                average: r.average,
                attempts: this._unpackAttempts(r.attempts),
                format_id: r.format_id,
                regional_single_record: r.regional_single_record,
                regional_average_record: r.regional_average_record,
                // null-safe date for sorting; unknown comps sort to front
                _date: r.year != null ? r.year * 10000 + r.month * 100 + r.day : 0,
            }))
            .sort((a, b) => {
                if (a.event_id !== b.event_id) return a.event_id.localeCompare(b.event_id);
                return a._date - b._date;
            })
            .map(({ _date, ...rest }) => rest); // strip the helper field

        const singles = this._db
            .prepare('SELECT event_id, best FROM ranks_single  WHERE person_id = ?')
            .all(id);
        const averages = this._db
            .prepare('SELECT event_id, best FROM ranks_average WHERE person_id = ?')
            .all(id);

        const personalRecords = {};
        for (const { event_id, best } of singles) {
            personalRecords[event_id] = { single: { best } };
        }
        for (const { event_id, best } of averages) {
            if (!personalRecords[event_id]) personalRecords[event_id] = {};
            personalRecords[event_id].average = { best };
        }

        const self = this;

        return {
            name: person.name,
            personalRecords,
            results,

            // Predicts the most likely next solve time for `eventId` and
            // returns probability figures for a specific candidate `time`
            // (seconds). Pass options.limit to control how many recent
            // solves feed the model (default 100) and options.tolerance
            // to control the +/- window width in seconds (default 0.5).
            //
            // Returns null if there's no/insufficient solve history for
            // that event, or if `time` is omitted (in which case only the
            // distribution stats — no per-time probabilities — apply, so
            // use .mostLikelyTime() instead).
            //
            // Example:
            //   const me = await api.fetchCompetitorData('2015ABCD01');
            //   const p = me.predictTime('333', 14.8);
            //   // p.mostLikelyTime -> e.g. 15.04
            //   // p.probabilityWithinTolerance -> e.g. 0.42 (42%)
            //   // p.probabilityFasterThanOrEqual -> e.g. 0.38 (38%)
            predictTime(eventId, time, options = {}) {
                const distribution = self._buildTimeDistribution(results, eventId, options);
                if (!distribution) return null;
                return self.calculateTimeProbability(distribution, time, options);
            },

            // Convenience accessor for just the most likely (mean) time,
            // without needing a candidate time or the full probability
            // breakdown. Returns null if there's insufficient history.
            mostLikelyTime(eventId, options = {}) {
                const distribution = self._buildTimeDistribution(results, eventId, options);
                return distribution ? distribution.mean : null;
            },
        };
    }

    // Returns Map<wcaId, data|{error}>.
    async fetchManyCompetitors(wcaIds) {
        await this._ensureReady();
        const unique = [...new Set(wcaIds.map((id) => this.normalizeWcaId(id)))];
        const tasks = unique.map((id) => () => this.fetchCompetitorData(id));
        const results = await this._pooled(tasks);
        const map = new Map();
        unique.forEach((id, i) => map.set(id, results[i]));
        return map;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Result aggregation helpers  (public surface unchanged)
    // ═══════════════════════════════════════════════════════════════════════

    getCompetitorName(data) {
        return { name: data.name };
    }
    getAllResultsForEvent(data, event) {
        return data.results.filter((r) => r.event_id === event);
    }
    getAverages(allResults) {
        return allResults.flatMap((r) => r.average);
    }

    getSolves(allResults, solvecount) {
        const reversed = [...allResults].reverse();
        let solves = reversed.flatMap((r) => this.filterAttempts([...r.attempts].reverse()));
        return solves.filter((v) => v > 0).slice(0, solvecount);
    }

    calculateAverage(solves) {
        if (solves.length === 0) return null;
        solves = [...solves].sort((a, b) => a - b).slice(1, -1);
        if (solves.length === 0) return 0; // Added check for single solve
        return solves.reduce((a, b) => a + b, 0) / solves.length / 100;
    }

    getPersonalRecords(data, event) {
        const rec = data.personalRecords[event];
        return { single: rec?.single?.best || null, average: rec?.average?.best || null };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Competition listing  (now local database only)
    // ═══════════════════════════════════════════════════════════════════════

    async fetchUpcomingCompetitions(options = {}) {
        const today = new Date().toISOString().slice(0, 10);
        const ninetyDaysOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
        const { start = today, end = ninetyDaysOut, countryIso2 = null, query = null } = options;

        await this._ensureReady();

        const [startYear, startMonth, startDay] = start.split('-').map(Number);
        const [endYear, endMonth, endDay] = end.split('-').map(Number);

        // Convert start/end dates to integer YYYYMMDD for simple comparison
        const startInt = startYear * 10000 + startMonth * 100 + startDay;
        const endInt = endYear * 10000 + endMonth * 100 + endDay;

        let sql = `
            SELECT competition_id, name, country_id,
                   year, month, day, end_year, end_month, end_day
            FROM   competitions
            WHERE
                -- competition starts on or before the window end
                (year * 10000 + month * 100 + day) <= :endInt
                AND
                -- competition starts on or after the window start
                (year * 10000 + month * 100 + day) >= :startInt
        `;
        const params = { startInt, endInt };

        if (countryIso2) {
            sql += ' AND country_id = :countryIso2';
            params.countryIso2 = countryIso2;
        }
        if (query) {
            sql += ' AND name LIKE :query';
            params.query = `%${query}%`;
        }

        sql += ' ORDER BY year, month, day';

        const dbComps = this._db.prepare(sql).all(params);

        // Transform DB rows to include start_date and end_date fields
        const allComps = dbComps.map((r) => ({
            id: r.competition_id,
            name: r.name,
            country_iso2: r.country_id,
            start_date: `${r.year}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`,
            end_date: `${r.end_year}-${String(r.end_month).padStart(2, '0')}-${String(r.end_day).padStart(2, '0')}`,
            source: 'database',
        }));

        // Annotate status and sort
        return allComps
            .map((c) => ({
                ...c,
                status: this.isOngoing(c) ? 'ongoing' : this.isFuture(c) ? 'upcoming' : 'past',
            }))
            .sort((a, b) => {
                if (a.status === 'ongoing' && b.status !== 'ongoing') return -1;
                if (b.status === 'ongoing' && a.status !== 'ongoing') return 1;
                return a.start_date.localeCompare(b.start_date);
            });
    }

    async searchCompetitions(query, options = {}) {
        return this.fetchUpcomingCompetitions({ ...options, query });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // WCIF  (network)
    // ═══════════════════════════════════════════════════════════════════════

    async fetchWcif(competitionId) {
        return this._cachedFetch(
            `wcif:${competitionId}`,
            async () => {
                const { data } = await axios.get(
                    `${this.competitionsUrl}/${competitionId}/wcif/public`,
                );
                return data;
            },
            this.wcifCacheTtlMs,
        );
    }

    parseWcifEvents(wcif) {
        if (!wcif?.events) return [];
        return wcif.events.map((event) => ({
            id: event.id,
            rounds: (event.rounds || []).map((round) => ({
                id: round.id,
                format: round.format,
                timeLimit: round.timeLimit,
                cutoff: round.cutoff,
                advancementCondition: round.advancementCondition,
                results: round.results || [],
            })),
        }));
    }

    parseWcifCompetitors(wcif) {
        if (!wcif?.persons) return [];
        return wcif.persons
            .filter((p) => p.registration?.status === 'accepted')
            .map((p) => ({
                wcaId: p.wcaId || null,
                name: p.name,
                countryIso2: p.countryIso2,
                events: p.registration?.eventIds || [],
            }));
    }

    getCompetitorsForEvent(competitors, eventId) {
        return competitors.filter((c) => c.events.includes(eventId));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // WCA Live GraphQL  (network)
    // ═══════════════════════════════════════════════════════════════════════

    async _wcaLiveQuery(query, variables = {}) {
        const { data } = await axios.post(
            this.wcaLiveUrl,
            { query, variables },
            { headers: { 'Content-Type': 'application/json' } },
        );
        if (data.errors?.length) {
            throw new Error(
                `WCA Live GraphQL error: ${data.errors.map((e) => e.message).join(', ')}`,
            );
        }
        return data.data;
    }

    async fetchLiveResults(competitionId) {
        return this._cachedFetch(
            `live:${competitionId}`,
            async () => {
                const data = await this._wcaLiveQuery(
                    `query CompetitionResults($id: ID!) {
                    competition(id: $id) {
                        id
                        events {
                            id
                            rounds {
                                id
                                results {
                                    ranking advancing attempts { result }
                                    best average
                                    person { wcaId name country { iso2 } }
                                }
                            }
                        }
                    }
                }`,
                    { id: competitionId },
                );
                const byEvent = {};
                for (const event of data?.competition?.events || []) {
                    byEvent[event.id] = {};
                    for (const round of event.rounds || []) {
                        byEvent[event.id][round.id] = round.results.map((r) => ({
                            wcaId: r.person.wcaId,
                            name: r.person.name,
                            countryIso2: r.person.country?.iso2,
                            ranking: r.ranking,
                            advancing: r.advancing,
                            best: r.best,
                            average: r.average,
                            attempts: r.attempts.map((a) => a.result),
                        }));
                    }
                }
                return byEvent;
            },
            30 * 1000,
        );
    }

    async isLiveInWcaLive(competitionId) {
        try {
            const data = await this._wcaLiveQuery(
                `query Check($id: ID!) {
                    competition(id: $id) {
                        id events { rounds { results { ranking } } }
                    }
                }`,
                { id: competitionId },
            );
            return (data?.competition?.events || []).some((e) =>
                e.rounds.some((r) => r.results.length > 0),
            );
        } catch {
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Statistical ranking model
    // ═══════════════════════════════════════════════════════════════════════

    async buildPerformanceProfile(data, eventId, limit = 12) {
        const allResults = this.getAllResultsForEvent(data, eventId);
        if (allResults.length === 0) return null;

        const recent = allResults.slice(-limit);
        const averages = recent
            .map((r) => this.centisecondsToSeconds(r.average))
            .filter((v) => v !== null && v > 0);

        if (averages.length === 0) {
            const singles = recent
                .map((r) => this.centisecondsToSeconds(r.best))
                .filter((v) => v !== null && v > 0);
            return this._buildDistribution(singles, { type: 'single' });
        }

        return this._buildDistribution(averages, { type: 'average' });
    }

    _normCdf(z) {
        const t = 1 / (1 + 0.2316419 * Math.abs(z));
        const poly =
            t *
            (0.31938153 +
                t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
        const approx = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * poly;
        return z >= 0 ? approx : 1 - approx;
    }

    // Normal probability DENSITY at x — a relative-likelihood value, not a
    // true probability (a continuous distribution assigns zero probability
    // to any single exact point). Useful for comparing "how likely is time A
    // vs time B", but callers wanting an actual percentage should use the
    // CDF-based range/threshold probabilities in calculateTimeProbability().
    _normalPdf(x, mu, sigma) {
        if (!sigma || sigma <= 0) return x === mu ? Infinity : 0;
        const z = (x - mu) / sigma;
        return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Expected-time / probability model
    //
    // Every function in this file that derives an "expected time" for a
    // competitor — whether from raw solves, competition averages, or a
    // single live result — builds it through _buildDistribution() (or its
    // single-observation counterpart _buildLiveDistribution()) below, and
    // every function that turns an expected time into an actual probability
    // (predicting a specific time, or comparing two competitors head-to-head)
    // goes through calculateTimeProbability(). Keeping both in one place
    // means the statistics (variance handling, zero-variance fallback, CDF
    // approximation) only need to be correct once.
    // ═══════════════════════════════════════════════════════════════════════

    // Central statistics builder: turns a flat array of time samples
    // (seconds) into a { mean, stdDev, sampleSize, type, recentSamples }
    // distribution. Returns null when there are fewer than `minSamples`
    // samples (default 1) to work with.
    _buildDistribution(samples, options = {}) {
        const { type = null, minSamples = 1 } = options;
        if (!samples || samples.length < minSamples) return null;

        const n = samples.length;
        const mean = samples.reduce((a, b) => a + b, 0) / n;
        const variance = n > 1 ? samples.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;

        return {
            mean,
            stdDev: Math.sqrt(variance) || mean * 0.05,
            sampleSize: n,
            type,
            recentSamples: samples,
        };
    }

    _profileFromSamples(samples, type = 'average') {
        return this._buildDistribution(samples, { type, minSamples: 1 });
    }

    // Synthetic distribution for a single live/in-progress observation.
    // A lone sample has no computable variance, so the spread is
    // approximated as a fraction of the competitor's historical stdDev when
    // one is available, or a flat percentage of the observed time otherwise.
    // Used wherever a live result needs to be treated as an "expected time"
    // going forward (e.g. after a round completes, before the next begins).
    _buildLiveDistribution(observedTime, options = {}) {
        const { historicalStdDev = null, scale = 1, fallbackFraction = 0.02 } = options;
        if (!Number.isFinite(observedTime) || observedTime <= 0) return null;

        const stdDev = historicalStdDev
            ? historicalStdDev * scale
            : observedTime * fallbackFraction;

        return {
            mean: observedTime,
            stdDev,
            sampleSize: 1,
            type: 'live',
            recentSamples: [observedTime],
        };
    }

    // Builds a normal-distribution profile (mean/stdDev) from a person's raw
    // solve times for one event. This operates on individual solves (single
    // attempts), not averages — use buildPerformanceProfile() instead when
    // you want competition-average-based profiles.
    //
    // Returns null when there isn't enough solve history (fewer than 2 valid
    // solves) to model.
    _buildTimeDistribution(results, eventId, options = {}) {
        const { limit = 100 } = options;

        const allResults = results.filter((r) => r.event_id === eventId);
        if (allResults.length === 0) return null;

        // getSolves() expects raw result rows and returns centisecond values,
        // most recent first, already flattened/filtered of DNF/DNS markers.
        const solvesCs = this.getSolves(allResults, limit);
        const samples = solvesCs
            .map((cs) => this.centisecondsToSeconds(cs))
            .filter((v) => v !== null && v > 0);

        return this._buildDistribution(samples, { type: 'solve', minSamples: 2 });
    }

    // Given a distribution (from _buildDistribution / _buildLiveDistribution
    // / _buildTimeDistribution) and a target time in seconds, returns the
    // most likely time alongside several probability figures for that
    // specific time. `options.tolerance` (default 0.5s) controls the width
    // of the "probability within tolerance" window.
    //
    // This is the single place in the file that turns a mean/stdDev pair
    // into an actual probability via the normal CDF — _probXBeatsY() below
    // reuses it rather than repeating the CDF math.
    calculateTimeProbability(distribution, time, options = {}) {
        if (!distribution || !Number.isFinite(time)) return null;
        const { tolerance = 0.5 } = options;
        const { mean, stdDev, sampleSize } = distribution;

        const density = this._normalPdf(time, mean, stdDev);

        // Probability of a solve landing at or below `time` (i.e. beating it,
        // since a lower cube time is better).
        const probabilityFasterThanOrEqual = this._normCdf((time - mean) / stdDev);

        // Probability within [time - tolerance, time + tolerance].
        const zHigh = (time + tolerance - mean) / stdDev;
        const zLow = (time - tolerance - mean) / stdDev;
        const probabilityWithinTolerance = this._normCdf(zHigh) - this._normCdf(zLow);

        return {
            time,
            mostLikelyTime: mean,
            stdDev,
            sampleSize,
            tolerance,
            density,
            probabilityFasterThanOrEqual,
            probabilitySlowerThan: 1 - probabilityFasterThanOrEqual,
            probabilityWithinTolerance,
        };
    }

    // Probability that competitor X's result beats (is faster than)
    // competitor Y's, given their two expected-time distributions. Modelled
    // as the distribution of the difference (X - Y): its mean is the gap
    // between their expected times and its stdDev combines both competitors'
    // uncertainty. "X beats Y" is then just "the difference is <= 0", which
    // is exactly what calculateTimeProbability()'s probabilityFasterThanOrEqual
    // already computes — so we build that synthetic distribution and reuse it
    // instead of calling the normal CDF a second time.
    _probXBeatsY(pX, pY) {
        const diffDistribution = {
            mean: pX.mean - pY.mean,
            stdDev: Math.sqrt(pX.stdDev ** 2 + pY.stdDev ** 2),
            sampleSize: Math.min(pX.sampleSize || 1, pY.sampleSize || 1),
        };
        const result = this.calculateTimeProbability(diffDistribution, 0);
        return result ? result.probabilityFasterThanOrEqual : 0.5;
    }

    computeRoundRankings(profiles) {
        const valid = [];
        for (const [wcaId, entry] of profiles.entries()) {
            if (entry?.profile && !entry.profile.error) {
                valid.push({
                    wcaId,
                    name: entry.name,
                    countryIso2: entry.countryIso2 || null,
                    profile: entry.profile,
                });
            }
        }
        if (valid.length === 0) return [];

        const n = valid.length;
        const winMatrix = valid.map((a) =>
            valid.map((b) => (a.wcaId === b.wcaId ? 0 : this._probXBeatsY(a.profile, b.profile))),
        );

        const SIMS = 2000;
        const podiumCounts = new Array(n).fill(0);
        const top8Counts = new Array(n).fill(0);
        const winCounts = new Array(n).fill(0);

        for (let sim = 0; sim < SIMS; sim++) {
            valid
                .map(({ profile }, i) => {
                    const u1 = 1 - Math.random(),
                        u2 = 1 - Math.random();
                    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                    return { i, t: Math.max(profile.mean + z * profile.stdDev, 0.01) };
                })
                .sort((a, b) => a.t - b.t)
                .forEach(({ i }, rank) => {
                    if (rank === 0) winCounts[i]++;
                    if (rank < 3) podiumCounts[i]++;
                    if (rank < 8) top8Counts[i]++;
                });
        }

        return valid
            .map((c, i) => ({
                wcaId: c.wcaId,
                name: c.name,
                expectedResult: c.profile.mean,
                countryIso2: c.countryIso2 || null,
                profile: c.profile,
                winProbability: winCounts[i] / SIMS,
                podiumProbability: podiumCounts[i] / SIMS,
                top8Probability: top8Counts[i] / SIMS,
                pairwiseWinRates: Object.fromEntries(
                    valid.map((b, j) => [b.wcaId, winMatrix[i][j]]),
                ),
            }))
            .sort((a, b) => a.expectedResult - b.expectedResult);
    }

    async analyzeRound(competitionId, eventId, roundId, liveResults = null) {
        const wcif = await this.fetchWcif(competitionId);
        const competitors = this.parseWcifCompetitors(wcif);
        const eventCompetitors = this.getCompetitorsForEvent(competitors, eventId);
        const withId = eventCompetitors.filter((c) => c.wcaId);
        const withoutId = eventCompetitors.filter((c) => !c.wcaId);
        const historyMap = await this.fetchManyCompetitors(withId.map((c) => c.wcaId));
        const profiles = new Map();

        for (const competitor of withId) {
            const id = this.normalizeWcaId(competitor.wcaId);
            const historyData = historyMap.get(id);
            if (historyData?.error) {
                profiles.set(id, { name: competitor.name, profile: null });
                continue;
            }

            let profile = await this.buildPerformanceProfile(historyData, eventId);
            if (liveResults?.[eventId]?.[roundId]) {
                const le = liveResults[eventId][roundId].find((r) => r.wcaId === id);
                if (le) {
                    const result = this.centisecondsToSeconds(le.average || le.best);
                    if (result)
                        profile = this._buildLiveDistribution(result, { fallbackFraction: 0.02 });
                }
            }
            profiles.set(id, { name: competitor.name, profile });
        }

        return {
            competitionId,
            eventId,
            roundId,
            analysedAt: new Date().toISOString(),
            totalRegistered: eventCompetitors.length,
            unranked: withoutId.map((c) => ({ name: c.name, reason: 'no_wca_id' })),
            rankings: this.computeRoundRankings(profiles),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HTTP request handlers
    // ═══════════════════════════════════════════════════════════════════════

    async handleCompetitionsRequest(req, res) {
        const { start, end, country, q } = req.query;
        try {
            return res.json(
                await this.fetchUpcomingCompetitions({
                    start,
                    end,
                    countryIso2: country || null,
                    query: q || null,
                }),
            );
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async handleCompetitionOverviewRequest(req, res) {
        const { id } = req.params;
        try {
            const [wcif, isLive] = await Promise.all([
                this.fetchWcif(id),
                this.isLiveInWcaLive(id),
            ]);
            return res.json({
                id,
                name: wcif.name,
                status: this.isOngoing({ start_date: wcif.schedule?.startDate })
                    ? 'ongoing'
                    : 'upcoming',
                isLive,
                events: this.parseWcifEvents(wcif),
                competitors: this.parseWcifCompetitors(wcif),
            });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async handleLiveResultsRequest(req, res) {
        const { id } = req.params;
        try {
            return res.json(await this.fetchLiveResults(id));
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // WCIF result extraction
    //
    // The WCIF public endpoint already carries round.results[] as results are
    // entered — the same data used to show result counts in the drawer.
    // We use this as the primary source so real times are always reflected,
    // even when the WCA Live GraphQL API is unreachable.
    // ═══════════════════════════════════════════════════════════════════════

    // Returns an array of result objects shaped identically to fetchLiveResults():
    //   { wcaId, ranking, advancing, best, average, attempts }
    // Returns null when no results are present for that round.
    _extractWcifResults(wcif, eventId, roundId) {
        // Build registrantId (integer) → person map for wcaId lookup
        const personMap = new Map();
        for (const p of wcif?.persons || []) {
            if (p.registrantId != null) {
                personMap.set(p.registrantId, {
                    wcaId: p.wcaId || null,
                    name: p.name || null,
                    countryIso2: p.countryIso2 || null,
                });
            }
        }

        const event = wcif?.events?.find((e) => e.id === eventId);
        const round = event?.rounds?.find((r) => r.id === roundId);
        if (!round?.results?.length) return null;

        const mapped = round.results
            .map((r) => {
                const person = personMap.get(r.personId);
                const best = typeof r.best === 'number' ? r.best : 0;
                const average = typeof r.average === 'number' ? r.average : 0;
                return {
                    wcaId: person?.wcaId || null,
                    name: person?.name || null,
                    countryIso2: person?.countryIso2 || null,
                    ranking: r.ranking || 0,
                    advancing: r.advancing === true,
                    best,
                    average,
                    attempts: (r.attempts || []).map((a) =>
                        typeof a.result === 'number' ? a.result : 0,
                    ),
                };
            })
            // Keep only entries with a valid result (positive = real time)
            .filter((r) => r.wcaId && (r.best > 0 || r.average > 0));

        return mapped.length > 0 ? mapped : null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Qualifying-set helpers  (subsequent-round filtering)
    // ═══════════════════════════════════════════════════════════════════════

    // Extract the ordinal round number from a WCIF round ID (e.g. "333-r2" → 2).
    _getRoundNumber(roundId) {
        const m = String(roundId).match(/-r(\d+)$/i);
        return m ? parseInt(m[1], 10) : 1;
    }

    // Return the ID of the round that immediately precedes roundId,
    // or null when roundId is already round 1.
    _getPreviousRoundId(roundId) {
        const n = this._getRoundNumber(roundId);
        if (n <= 1) return null;
        return String(roundId).replace(/-r(\d+)$/i, `-r${n - 1}`);
    }

    // Return the WCIF round object for (eventId, roundId), or null if not found.
    _getWcifRound(wcif, eventId, roundId) {
        const event = wcif?.events?.find((e) => e.id === eventId);
        return event?.rounds?.find((r) => r.id === roundId) || null;
    }

    // Determine which competitors qualify from the previous round.
    //
    // Strategy (in priority order):
    //  1. If prevRoundLiveResults is a non-empty array and any entry carries
    //     advancing === true, use those entries directly.
    //  2. If prevRoundLiveResults has entries without the advancing flag, sort
    //     by result and apply the advancement condition.
    //  3. If no live results exist, fall back to predicting from profiles:
    //     sort allEventProfileMap by predicted mean and apply the condition.
    //
    // Returns { wcaIds: Set<string>, fromRealResults: boolean }.
    _computeQualifiers(advancementCondition, prevRoundLiveResults, allEventProfileMap) {
        if (prevRoundLiveResults && prevRoundLiveResults.length > 0) {
            // Prefer explicit advancing flag when the WCA Live API sets it
            const explicitlyAdvancing = prevRoundLiveResults.filter(
                (r) => r.advancing === true && r.wcaId,
            );
            if (explicitlyAdvancing.length > 0) {
                return {
                    wcaIds: new Set(explicitlyAdvancing.map((r) => r.wcaId)),
                    fromRealResults: true,
                };
            }

            // No advancing flag — compute from sorted results
            const completed = prevRoundLiveResults
                .filter((r) => r.wcaId && (r.average > 0 || r.best > 0))
                .sort((a, b) => {
                    const aRes = a.average > 0 ? a.average : a.best;
                    const bRes = b.average > 0 ? b.average : b.best;
                    return aRes - bRes;
                });

            const cutoff = this._applyAdvCutoff(advancementCondition, completed.length, completed);
            return {
                wcaIds: new Set(completed.slice(0, cutoff).map((r) => r.wcaId)),
                fromRealResults: true,
            };
        }

        // No real results — predict from historical profiles
        const withProfile = [];
        for (const [wcaId, entry] of allEventProfileMap) {
            if (entry?.profile?.mean) {
                withProfile.push({ wcaId, mean: entry.profile.mean });
            }
        }
        withProfile.sort((a, b) => a.mean - b.mean);

        const cutoff = this._applyAdvCutoff(advancementCondition, withProfile.length, null);
        return {
            wcaIds: new Set(withProfile.slice(0, cutoff).map((c) => c.wcaId)),
            fromRealResults: false,
        };
    }

    // Translate an advancementCondition into a concrete count of qualifiers.
    // sortedResults is required for 'attemptResult' type; may be null for others.
    _applyAdvCutoff(cond, totalCount, sortedResults) {
        if (!cond) return totalCount;
        switch (cond.type) {
            case 'percent':
                return Math.ceil((totalCount * cond.level) / 100);
            case 'ranking':
                return Math.min(cond.level, totalCount);
            case 'attemptResult':
                if (sortedResults) {
                    return sortedResults.filter((r) => {
                        const res = r.average > 0 ? r.average : r.best;
                        return res > 0 && res <= cond.level;
                    }).length;
                }
                // Cannot apply time-based cutoff to predictions — include all ranked
                return totalCount;
            default:
                return totalCount;
        }
    }

    async handleStreamingAnalysisRequest(req, res) {
        const { id, eventId, roundId } = req.params;
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        const send = (obj) => res.write(JSON.stringify(obj) + '\n');

        try {
            // ── Fetch WCIF and live results (both use response-level caching) ──
            let wcaLiveResults = null;
            try {
                if (await this.isLiveInWcaLive(id))
                    wcaLiveResults = await this.fetchLiveResults(id);
            } catch (_) {
                /* live API unreachable — WCIF results will be used */
            }

            const wcif = await this.fetchWcif(id);
            const allCompetitors = this.parseWcifCompetitors(wcif);
            const allEventCompetitors = this.getCompetitorsForEvent(allCompetitors, eventId);

            // ── Determine round numbers up-front ────────────────────────────
            const roundNum = this._getRoundNumber(roundId);
            const prevRoundId = roundNum > 1 ? this._getPreviousRoundId(roundId) : null;

            // ── Build effective live results from WCIF + WCA Live API ────────
            // The WCIF already contains round.results[] as times are entered — this
            // is the authoritative source and always reflects the current state.
            // WCA Live GraphQL results overlay the WCIF data where available.
            const effectiveLive = {};

            // Seed from WCIF results for every round we care about
            const roundsToExtract = [roundId];
            if (prevRoundId) roundsToExtract.push(prevRoundId);
            for (const rid of roundsToExtract) {
                const extracted = this._extractWcifResults(wcif, eventId, rid);
                if (extracted) {
                    effectiveLive[eventId] = effectiveLive[eventId] || {};
                    effectiveLive[eventId][rid] = extracted;
                }
            }

            // WCA Live API takes priority (may be more up-to-date)
            if (wcaLiveResults?.[eventId]) {
                effectiveLive[eventId] = effectiveLive[eventId] || {};
                for (const [rid, results] of Object.entries(wcaLiveResults[eventId])) {
                    if (results?.length) effectiveLive[eventId][rid] = results;
                }
            }

            const liveResults = Object.keys(effectiveLive).length > 0 ? effectiveLive : null;

            // ── Per-competition profile cache ────────────────────────────────
            // Profiles are keyed as "<wcaId>:<eventId>" and persist for the
            // lifetime of the server process so that subsequent round analyses
            // of the same competition never re-fetch competitor histories.
            if (!this.compProfileCache.has(id)) {
                this.compProfileCache.set(id, new Map());
            }
            const profileCache = this.compProfileCache.get(id);

            // ── Determine qualifying set for subsequent rounds ───────────────
            let qualifyingSet = null; // null ⇒ all registered competitors participate

            if (roundNum > 1) {
                const prevWcifRound = this._getWcifRound(wcif, eventId, prevRoundId);
                const advCond = prevWcifRound?.advancementCondition || null;
                const prevRoundLive = liveResults?.[eventId]?.[prevRoundId] || null;

                if (!prevRoundLive || prevRoundLive.length === 0) {
                    // No real results for the previous round — predict qualifying
                    // set from historical profiles of ALL event competitors.
                    const allWithId = allEventCompetitors.filter((c) => c.wcaId);

                    // Fetch and cache any profiles we haven't seen yet
                    const toFetch = allWithId.filter((c) => {
                        const cacheKey = `${this.normalizeWcaId(c.wcaId)}:${eventId}`;
                        return !profileCache.has(cacheKey);
                    });
                    if (toFetch.length > 0) {
                        const historyMap = await this.fetchManyCompetitors(
                            toFetch.map((c) => c.wcaId),
                        );
                        await Promise.all(
                            toFetch.map(async (competitor) => {
                                const norm = this.normalizeWcaId(competitor.wcaId);
                                const cacheKey = `${norm}:${eventId}`;
                                const historyData = historyMap.get(norm);
                                if (!historyData || historyData.error) {
                                    profileCache.set(cacheKey, null);
                                } else {
                                    profileCache.set(
                                        cacheKey,
                                        await this.buildPerformanceProfile(historyData, eventId),
                                    );
                                }
                            }),
                        );
                    }

                    // Build a profile map for the qualifying-set computation
                    const allProfileMap = new Map();
                    for (const c of allWithId) {
                        const norm = this.normalizeWcaId(c.wcaId);
                        allProfileMap.set(norm, {
                            name: c.name,
                            profile: profileCache.get(`${norm}:${eventId}`) || null,
                        });
                    }

                    const qualified = this._computeQualifiers(advCond, null, allProfileMap);
                    qualifyingSet = qualified.wcaIds;
                } else {
                    // Real results available for the previous round — use them
                    const qualified = this._computeQualifiers(advCond, prevRoundLive, null);
                    qualifyingSet = qualified.wcaIds;
                }
            }

            // ── Filter competitors to the qualifying set ──────────────────────
            const eventCompetitors = qualifyingSet
                ? allEventCompetitors.filter(
                      (c) => c.wcaId && qualifyingSet.has(this.normalizeWcaId(c.wcaId)),
                  )
                : allEventCompetitors;

            const withId = eventCompetitors.filter((c) => c.wcaId);
            // Competitors without a WCA ID can only appear in round 1
            const withoutId = roundNum === 1 ? allEventCompetitors.filter((c) => !c.wcaId) : [];

            // ── Advancement condition for the current round ──────────────────
            // Tells the front-end who advances to the next round (null = final).
            const currentWcifRound = this._getWcifRound(wcif, eventId, roundId);
            const advancementCondition = currentWcifRound?.advancementCondition || null;

            send({
                type: 'meta',
                totalRegistered: roundNum === 1 ? allEventCompetitors.length : withId.length,
                unranked: withoutId.map((c) => ({ name: c.name, reason: 'no_wca_id' })),
                advancementCondition,
            });

            // ── Build profiles for qualifying competitors ──────────────────
            const profileMap = new Map();

            await Promise.all(
                withId.map(async (competitor) => {
                    const idNorm = this.normalizeWcaId(competitor.wcaId);
                    const cacheKey = `${idNorm}:${eventId}`;
                    try {
                        // Retrieve from per-competition cache, fetching if absent
                        if (!profileCache.has(cacheKey)) {
                            const historyData = await this.fetchCompetitorData(idNorm);
                            profileCache.set(
                                cacheKey,
                                await this.buildPerformanceProfile(historyData, eventId),
                            );
                        }
                        let profile = profileCache.get(cacheKey) || null;

                        // For subsequent rounds: if the competitor has a real result
                        // from the previous round, use that as the base profile
                        // (it is more relevant than the historical mean).
                        if (prevRoundId && liveResults?.[eventId]?.[prevRoundId]) {
                            const prevLe = liveResults[eventId][prevRoundId].find(
                                (r) => r.wcaId === idNorm,
                            );
                            if (prevLe) {
                                const prevResult = this.centisecondsToSeconds(
                                    prevLe.average > 0 ? prevLe.average : prevLe.best,
                                );
                                if (prevResult) {
                                    // Keep historical stdDev scaled down (they are warmed up)
                                    profile = this._buildLiveDistribution(prevResult, {
                                        historicalStdDev: profile?.stdDev,
                                        scale: 0.7,
                                        fallbackFraction: 0.04,
                                    });
                                }
                            }
                        }

                        // Current-round live result takes the highest priority
                        if (liveResults?.[eventId]?.[roundId]) {
                            const le = liveResults[eventId][roundId].find(
                                (r) => r.wcaId === idNorm,
                            );
                            if (le) {
                                const result = this.centisecondsToSeconds(
                                    le.average > 0 ? le.average : le.best,
                                );
                                if (result) {
                                    const historicalProfile = profileCache.get(cacheKey);
                                    profile = this._buildLiveDistribution(result, {
                                        historicalStdDev: historicalProfile?.stdDev,
                                        scale: 0.5,
                                        fallbackFraction: 0.02,
                                    });
                                }
                            }
                        }

                        profileMap.set(idNorm, {
                            name: competitor.name,
                            countryIso2: competitor.countryIso2 || null,
                            profile,
                        });
                        send({
                            type: 'profile',
                            wcaId: competitor.wcaId,
                            name: competitor.name,
                            country: competitor.countryIso2 || null,
                            profile: profile || null,
                        });
                    } catch (err) {
                        // Do NOT cache failures — allow the next refresh to retry.
                        console.warn(
                            `[WcaApi] Profile failed for ${idNorm} (${competitor.name}) in ${id}/${eventId}: ${err.message}`,
                        );
                        profileMap.set(idNorm, {
                            name: competitor.name,
                            countryIso2: competitor.countryIso2 || null,
                            profile: null,
                        });
                        send({
                            type: 'profile',
                            wcaId: competitor.wcaId,
                            name: competitor.name,
                            country: competitor.countryIso2 || null,
                            profile: null,
                            error: err.message,
                        });
                    }
                }),
            );

            // Collect competitors who have WCA IDs but no usable profile data.
            // These are returned alongside the rankings so the front-end can
            // display them in the table rather than silently omitting them.
            const noProfile = [];
            for (const [wcaId, entry] of profileMap) {
                if (!entry.profile) {
                    noProfile.push({
                        wcaId,
                        name: entry.name,
                        countryIso2: entry.countryIso2 || null,
                    });
                }
            }

            send({
                type: 'rankings',
                rankings: this.computeRoundRankings(profileMap),
                noProfile,
                analysedAt: new Date().toISOString(),
            });
        } catch (err) {
            send({ type: 'error', message: err.message });
        } finally {
            send({ type: 'done' });
            res.end();
        }
    }

    async handleForceRefreshRequest(req, res) {
        if (!this._ready && this._initPromise) {
            return res.status(409).json({ error: 'Refresh already in progress' });
        }
        try {
            this.forceRefreshExport().catch((err) =>
                console.error('[WcaApi] Background refresh failed:', err),
            );
            return res.json({ status: 'refresh_started' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    async handleCancelRefreshRequest(req, res) {
        if (!this._initPromise) {
            return res.status(409).json({ error: 'No refresh in progress' });
        }

        if (!this.cancelRefreshExport()) {
            return res.status(409).json({ error: 'No refresh in progress' });
        }

        return res.json({ status: 'cancellation_requested' });
    }

    cancelRefreshExport() {
        if (!this._refreshAbortController || this._refreshAbortController.signal.aborted) {
            return false;
        }
        this._refreshAbortController.abort();
        return true;
    }

    // Open the existing DB file without triggering a full _ensureReady() / download.
    // Safe to call even if _db is already set (no-op in that case).
    _tryOpenExistingDb() {
        if (this._db) return;
        if (!fs.existsSync(this.dbPath)) return;
        try {
            this._db = this._openDb();
        } catch {
            // leave _db as null — caller checks before using
        }
    }

    async handleMetadataRequest(req, res) {
        // Ensure the DB is open if it already exists on disk (e.g. after a server
        // restart before any WCA query has been served).
        this._tryOpenExistingDb();

        const isRefreshing = !this._ready && this._initPromise != null;

        let exportDate = null;
        let personCount = null;
        let resultCount = null;
        let competitionCount = null;
        let nextScheduledCheck = null;

        if (this._db) {
            try {
                exportDate = this._storedExportDate();
                personCount =
                    this._db.prepare('SELECT COUNT(*) AS n FROM persons').get()?.n ?? null;
                resultCount =
                    this._db.prepare('SELECT COUNT(*) AS n FROM results').get()?.n ?? null;
                competitionCount =
                    this._db.prepare('SELECT COUNT(*) AS n FROM competitions').get()?.n ?? null;

                if (exportDate) {
                    nextScheduledCheck = new Date(
                        new Date(exportDate).getTime() + this.exportMaxAgeMs,
                    ).toISOString();
                }
            } catch {
                // DB may be mid-refresh; return what we have
            }
        }

        return res.json({
            exportDate,
            nextScheduledCheck,
            isRefreshing,
            personCount,
            resultCount,
            competitionCount,
        });
    }

    async handleRequest(req, res) {
        const { wcaId, event } = req.params;
        const { num, getsolves, getaverages } = req.query;

        const normalizedId = this.normalizeWcaId(wcaId);
        if (!this.isValidWcaId(normalizedId)) {
            return res.status(400).json({ error: 'Invalid WCA ID format' });
        }

        try {
            const data = await this.fetchCompetitorData(normalizedId);
            if (event === 'name') return res.json(this.getCompetitorName(data));

            const allResults = this.getAllResultsForEvent(data, event);
            const rawNum = Number.parseInt(num, 10);
            const solvecount = Number.isFinite(rawNum) && rawNum > 0 ? Math.min(rawNum, 200) : 12;

            if (getsolves) {
                return res.json({
                    allResults: [...allResults]
                        .reverse()
                        .flatMap((r) => this.filterAttempts([...r.attempts].reverse())),
                });
            }
            if (getaverages) {
                return res.json({ allAverages: this.getAverages(allResults) });
            }

            return res.status(200).json({
                average: this.calculateAverage(this.getSolves(allResults, solvecount)),
                records: this.getPersonalRecords(data, event),
            });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
}
