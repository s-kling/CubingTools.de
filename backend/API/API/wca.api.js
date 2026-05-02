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
// Benefits over pure in-memory indexes:
//   • Zero startup cost after first import — the DB file survives restarts.
//   • ~90 % lower RAM — only the rows for the requested WCA ID are loaded.
//   • Incremental re-import — on a new export only changed/new rows are written
//     (INSERT OR REPLACE); unchanged rows are a cheap no-op in SQLite.
//   • Crash-safe — the import runs inside a single transaction; a partial import
//     leaves the old data intact.
//
// Upcoming-competition listing, WCIF, and WCA Live data still use the network
// APIs because those cover events not yet in the export.
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

        // ── SQLite handle ─────────────────────────────────────────────────────
        // Opened lazily on first use; kept open for the lifetime of the instance.
        this._db = null;

        // True only after the DB is open AND fully populated.
        // _db is set as soon as the file is opened (before import); callers must
        // check _ready, not _db, to know whether queries are safe.
        this._ready = false;

        // Promise guard so concurrent callers share a single initialisation.
        this._initPromise = null;

        // ── Network response caches (competitions / WCIF / live) ──────────────
        this.cacheTtlMs = 5 * 60 * 1000;
        this.competitionsCacheTtlMs = 24 * 60 * 60 * 1000;
        this.wcifCacheTtlMs = 2 * 60 * 1000;
        this.responseCache = new Map();

        // ── Concurrency cap for bulk profile builds ───────────────────────────
        this.maxConcurrentPersonFetches = 20;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SQLite schema & helpers
    // ═══════════════════════════════════════════════════════════════════════

    _openDb() {
        fs.mkdirSync(this.exportDir, { recursive: true });
        const db = new DatabaseSync(this.dbPath);

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

            CREATE TABLE IF NOT EXISTS competitions (
                competition_id TEXT PRIMARY KEY,
                year           INTEGER NOT NULL,
                month          INTEGER NOT NULL,
                day            INTEGER NOT NULL
            );
        `);

        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_results_person_event
                ON results (person_id, event_id);
        `);

        return db;
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

    async _checkForNewerExport() {
        const stored = this._storedExportDate();

        if (stored) {
            const storedMs = new Date(stored).getTime();
            if (Date.now() - storedMs < this.exportMaxAgeMs) {
                return { needsDownload: false, latestExportDate: stored };
            }
        }

        try {
            const { data } = await axios.get(this.exportMetaUrl, { timeout: 10_000 });
            const latestExportDate = data.export_date;

            if (!stored || latestExportDate !== stored) {
                return { needsDownload: true, latestExportDate };
            }
            // Up to date — bump stored date so we skip the check for another week.
            this._saveExportDate(latestExportDate);
            return { needsDownload: false, latestExportDate };
        } catch (err) {
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

    async _downloadAndExtract() {
        fs.mkdirSync(this.exportDir, { recursive: true });
        await this._checkDiskSpace();
        const zipPath = this._exportPath('wca_export.tsv.zip');

        console.log('[WcaApi] Downloading WCA TSV export...');
        const response = await axios.get(this.exportTsvUrl, {
            responseType: 'stream',
            timeout: 10 * 60 * 1000,
        });
        await pipeline(response.data, createWriteStream(zipPath));
        console.log('[WcaApi] Download complete. Extracting...');

        await new Promise((resolve, reject) => {
            createReadStream(zipPath)
                .pipe(Extract({ path: this.exportDir }))
                .on('close', resolve)
                .on('error', reject);
        });

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
    _parseTsv(filePath, rowFn, onProgress = null) {
        const PROGRESS_INTERVAL = 50_000;

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

            transform.on('finish', () => resolve(rowCount));
            transform.on('error', reject);
            const src = createReadStream(filePath);
            src.on('error', reject);
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

    async _importExport() {
        const db = this._db;

        // Use disk for temp tables during import to avoid memory pressure
        db.exec('PRAGMA temp_store = FILE');

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
                'INSERT OR REPLACE INTO competitions (competition_id, year, month, day) VALUES (?,?,?,?)',
            );
            let compRows = 0;
            await this._parseTsv(
                this._exportPath('WCA_export_competitions.tsv'),
                (f) => {
                    // id(0) year(14) month(15) day(16)
                    insComp.run(f[0], Number(f[14]), Number(f[15]), Number(f[16]));
                    compRows++;
                },
                (n) => renderBar('competitions', n, APPROX_ROWS.competitions),
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
                this._db = this._openDb();

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

                this._ready = true;
            } catch (err) {
                this._initPromise = null;
                throw err;
            }
        })();

        await this._initPromise;
        this._initPromise = null;
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

        // Pause any new queries during refresh
        this._ready = false;
        this._initPromise = (async () => {
            try {
                // Clean up any leftover TSVs from a previous failed run
                this._cleanupTsvFiles();

                await this._checkDiskSpace();
                await this._downloadAndExtract();

                // Wipe existing DB tables so stale rows from removed competitors
                // don't linger — faster than DELETE on 38M rows
                this._db.exec(`
                    DROP TABLE IF EXISTS persons;
                    DROP TABLE IF EXISTS results;
                    DROP TABLE IF EXISTS ranks_single;
                    DROP TABLE IF EXISTS ranks_average;
                    DROP TABLE IF EXISTS competitions;
                    DROP TABLE IF EXISTS meta;
                `);

                // Recreate schema
                this._db = this._openDb();

                await this._importExport();
                this._cleanupTsvFiles();

                const { latestExportDate } = await this._checkForNewerExport();
                if (latestExportDate) this._saveExportDate(latestExportDate);

                this._ready = true;
                console.log('[WcaApi] Force refresh complete.');
            } catch (err) {
                // Leave _ready false so the next request retries properly
                this._initPromise = null;
                throw err;
            }
        })();

        await this._initPromise;
        this._initPromise = null;
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

        return { name: person.name, personalRecords, results };
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
    // Competition listing  (network)
    // ═══════════════════════════════════════════════════════════════════════

    async fetchUpcomingCompetitions(options = {}) {
        const today = new Date().toISOString().slice(0, 10);
        const ninetyDaysOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
        const { start = today, end = ninetyDaysOut, countryIso2 = null, query = null } = options;

        return this._cachedFetch(
            `competitions:${start}:${end}:${countryIso2}:${query}`,
            async () => {
                await this._ensureReady();

                const [startYear, startMonth, startDay] = start.split('-').map(Number);
                const [endYear, endMonth, endDay] = end.split('-').map(Number);

                // ── 1. DB fetch ───────────────────────────────────────────────
                let dbComps = [];
                try {
                    // Convert start/end dates to integer YYYYMMDD for simple comparison
                    const startInt = startYear * 10000 + startMonth * 100 + startDay;
                    const endInt = endYear * 10000 + endMonth * 100 + endDay;

                    let sql = `
                        SELECT competition_id, name, country_id,
                               year, month, day
                        FROM   competitions
                        WHERE
                            -- competition starts on or before the window end
                            (year * 10000 + month * 100 + day) <= :endInt
                            AND
                            -- competition starts on or after the window start
                            -- (we only store start date, so use that as proxy for end)
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

                    dbComps = this._db.prepare(sql).all(params);
                } catch (err) {
                    console.warn('[WcaApi] DB competitions fetch failed:', err.message);
                }

                // ── 2. Network fetch for upcoming/ongoing (richer data) ───────
                let networkComps = [];
                try {
                    const all = [];
                    let page = 1,
                        hasMore = true;
                    while (hasMore) {
                        const params = new URLSearchParams({ start, end, page });
                        if (countryIso2) params.set('country_iso2', countryIso2);
                        if (query) params.set('q', query);
                        const { data } = await axios.get(`${this.competitionsUrl}?${params}`);
                        if (!Array.isArray(data) || data.length === 0) {
                            hasMore = false;
                        } else {
                            all.push(...data);
                            hasMore = data.length === 25;
                            page++;
                        }
                    }
                    networkComps = all;
                } catch (err) {
                    console.warn('[WcaApi] Network competitions fetch failed:', err.message);
                }

                // ── 3. Merge — network wins on conflict (richer fields) ───────
                const networkById = new Map(networkComps.map((c) => [c.id, c]));

                const dbMapped = dbComps
                    .filter((r) => !networkById.has(r.competition_id))
                    .map((r) => ({
                        id: r.competition_id,
                        name: r.name,
                        country_iso2: r.country_id,
                        start_date: `${r.year}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`,
                        // We only store start date in the DB — use it as end_date too
                        // so isOngoing/isFuture don't crash on a missing field
                        end_date: `${r.year}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`,
                        source: 'export',
                    }));

                const allComps = [
                    ...networkComps.map((c) => ({ ...c, source: 'api' })),
                    ...dbMapped,
                ];

                // ── 4. Annotate status and sort ───────────────────────────────
                return allComps
                    .map((c) => ({
                        ...c,
                        status: this.isOngoing(c)
                            ? 'ongoing'
                            : this.isFuture(c)
                              ? 'upcoming'
                              : 'past',
                    }))
                    .sort((a, b) => {
                        if (a.status === 'ongoing' && b.status !== 'ongoing') return -1;
                        if (b.status === 'ongoing' && a.status !== 'ongoing') return 1;
                        return a.start_date.localeCompare(b.start_date);
                    });
            },
            this.competitionsCacheTtlMs,
        );
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

    async buildPerformanceProfile(data, eventId, limit = 10) {
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
            return singles.length === 0 ? null : this._profileFromSamples(singles, 'single');
        }
        return this._profileFromSamples(averages, 'average');
    }

    _profileFromSamples(samples, type) {
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

    _normCdf(z) {
        const t = 1 / (1 + 0.2316419 * Math.abs(z));
        const poly =
            t *
            (0.31938153 +
                t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
        const approx = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * poly;
        return z >= 0 ? approx : 1 - approx;
    }

    _probXBeatsY(pX, pY) {
        const md = pX.mean - pY.mean;
        const sd = Math.sqrt(pX.stdDev ** 2 + pY.stdDev ** 2);
        return this._normCdf(-md / sd);
    }

    computeRoundRankings(profiles) {
        const valid = [];
        for (const [wcaId, entry] of profiles.entries()) {
            if (entry?.profile && !entry.profile.error) {
                valid.push({ wcaId, name: entry.name, profile: entry.profile });
            }
        }
        if (valid.length === 0) return [];

        const n = valid.length;
        const winMatrix = valid.map((a) =>
            valid.map((b) => (a.wcaId === b.wcaId ? 0 : this._probXBeatsY(a.profile, b.profile))),
        );
        const expectedRanks = valid.map(
            (_, i) => 1 + valid.reduce((s, _, j) => (j !== i ? s + winMatrix[j][i] : s), 0),
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
                profile: c.profile,
                expectedRank: expectedRanks[i],
                winProbability: winCounts[i] / SIMS,
                podiumProbability: podiumCounts[i] / SIMS,
                top8Probability: top8Counts[i] / SIMS,
                pairwiseWinRates: Object.fromEntries(
                    valid.map((b, j) => [b.wcaId, winMatrix[i][j]]),
                ),
            }))
            .sort((a, b) => a.expectedRank - b.expectedRank);
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
                        profile = {
                            mean: result,
                            stdDev: result * 0.02,
                            sampleSize: 1,
                            type: 'live',
                            recentSamples: [result],
                        };
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

    async handleStreamingAnalysisRequest(req, res) {
        const { id, eventId, roundId } = req.params;
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        const send = (obj) => res.write(JSON.stringify(obj) + '\n');

        try {
            let liveResults = null;
            if (await this.isLiveInWcaLive(id)) liveResults = await this.fetchLiveResults(id);

            const wcif = await this.fetchWcif(id);
            const competitors = this.parseWcifCompetitors(wcif);
            const eventCompetitors = this.getCompetitorsForEvent(competitors, eventId);
            const withId = eventCompetitors.filter((c) => c.wcaId);
            const withoutId = eventCompetitors.filter((c) => !c.wcaId);

            send({
                type: 'meta',
                totalRegistered: eventCompetitors.length,
                unranked: withoutId.map((c) => ({ name: c.name, reason: 'no_wca_id' })),
            });

            const profileMap = new Map();

            await Promise.all(
                withId.map(async (competitor) => {
                    const idNorm = this.normalizeWcaId(competitor.wcaId);
                    try {
                        const historyData = await this.fetchCompetitorData(idNorm);
                        let profile = await this.buildPerformanceProfile(historyData, eventId);

                        if (liveResults?.[eventId]?.[roundId]) {
                            const le = liveResults[eventId][roundId].find(
                                (r) => r.wcaId === idNorm,
                            );
                            if (le) {
                                const result = this.centisecondsToSeconds(le.average || le.best);
                                if (result)
                                    profile = {
                                        mean: result,
                                        stdDev: result * 0.02,
                                        sampleSize: 1,
                                        type: 'live',
                                        recentSamples: [result],
                                    };
                            }
                        }

                        profileMap.set(idNorm, { name: competitor.name, profile });
                        send({
                            type: 'profile',
                            wcaId: competitor.wcaId,
                            name: competitor.name,
                            country: competitor.countryIso2 || null,
                            profile: profile || null,
                        });
                    } catch (err) {
                        profileMap.set(idNorm, { name: competitor.name, profile: null });
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

            send({
                type: 'rankings',
                rankings: this.computeRoundRankings(profileMap),
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
