import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { ROOT_DIR } from '../lib/config.js';

export const DEFAULT_EXPORT_DIR = process.env.WCA_EXPORT_DIR || path.join(ROOT_DIR, 'wca_export');

// Round ordering inside one competition (WCA RoundTypes). Used to sort a person's results
// chronologically; ordering by date alone mixed up rounds of the same competition.
export const ROUND_ORDER_SQL = `CASE round_type_id
    WHEN '0' THEN 0 WHEN '1' THEN 1 WHEN 'd' THEN 1 WHEN '2' THEN 2 WHEN 'e' THEN 2
    WHEN 'g' THEN 3 WHEN '3' THEN 3 WHEN 'b' THEN 8 WHEN 'c' THEN 9 WHEN 'f' THEN 9 ELSE 5 END`;

export const SCHEMA_EXPORT = `
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS persons (
        wca_id TEXT PRIMARY KEY, name TEXT NOT NULL, country_id TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS competitions (
        competition_id TEXT PRIMARY KEY, name TEXT NOT NULL, country_id TEXT NOT NULL,
        start_date INTEGER NOT NULL, end_date INTEGER NOT NULL
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY,
        person_id TEXT NOT NULL, competition_id TEXT NOT NULL, event_id TEXT NOT NULL,
        round_type_id TEXT NOT NULL, round_order INTEGER NOT NULL, comp_date INTEGER NOT NULL,
        pos INTEGER NOT NULL, best INTEGER NOT NULL, average INTEGER NOT NULL, format_id TEXT NOT NULL,
        regional_single_record TEXT, regional_average_record TEXT,
        a1 INTEGER, a2 INTEGER, a3 INTEGER, a4 INTEGER, a5 INTEGER
    );
    CREATE TABLE IF NOT EXISTS ranks_single (
        person_id TEXT NOT NULL, event_id TEXT NOT NULL, best INTEGER NOT NULL,
        PRIMARY KEY (person_id, event_id)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS ranks_average (
        person_id TEXT NOT NULL, event_id TEXT NOT NULL, best INTEGER NOT NULL,
        PRIMARY KEY (person_id, event_id)
    ) WITHOUT ROWID;
`;

export const INDEX_EXPORT = `
    CREATE INDEX IF NOT EXISTS idx_results_person_event
        ON results (person_id, event_id, comp_date, round_order);
    CREATE INDEX IF NOT EXISTS idx_competitions_start ON competitions (start_date);
    CREATE INDEX IF NOT EXISTS idx_competitions_end ON competitions (end_date);
`;

export const SCHEMA_LIVE = `
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS competitions (
        competition_id TEXT PRIMARY KEY, name TEXT NOT NULL, country_id TEXT NOT NULL,
        start_date INTEGER NOT NULL, end_date INTEGER NOT NULL
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_live_comp_start ON competitions (start_date);
    CREATE INDEX IF NOT EXISTS idx_live_comp_end ON competitions (end_date);
`;

export const toDateInt = (iso) => {
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return y * 10000 + m * 100 + d;
};
export const fromDateInt = (n) => {
    const y = Math.floor(n / 10000);
    const m = Math.floor((n % 10000) / 100);
    const d = n % 100;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const unpackAttempts = (r) =>
    [r.a1, r.a2, r.a3, r.a4, r.a5].filter((v) => v !== null && v !== undefined);

/**
 * Read side of the WCA data. Safe to instantiate in any process or worker thread.
 *
 * Layout (all inside `dir`):
 *   current.json        {"file":"wca-<stamp>.db","exportDate":"...","version":"<stamp>"}
 *   wca-<stamp>.db      immutable once published (written by the importer, renamed into place)
 *   live.db             upcoming competitions synced from the WCA API (WAL, single writer)
 *
 * Publishing a new export is an atomic rename of current.json; readers notice the changed
 * pointer (checked at most every `pollMs`) and switch handles without any coordination, so
 * a refresh never blocks or interrupts queries - in this or any other process.
 */
export class WcaStore {
    constructor({ dir = DEFAULT_EXPORT_DIR, pollMs = 2000 } = {}) {
        this.dir = dir;
        this.pollMs = pollMs;
        this._exportDb = null;
        this._liveDb = null;
        this._pointer = null;
        this._pointerCheckedAt = 0;
        this._stmts = new WeakMap(); // db -> Map(sql -> statement)
        this.onSwitch = null;
    }

    pointerPath() {
        return path.join(this.dir, 'current.json');
    }

    _readPointer() {
        try {
            return JSON.parse(fs.readFileSync(this.pointerPath(), 'utf8'));
        } catch {
            return null;
        }
    }

    /** True when an imported export is available to query. */
    isReady() {
        return Boolean(this.exportDb());
    }

    version() {
        this.exportDb();
        return this._pointer?.version || null;
    }

    exportDate() {
        this.exportDb();
        return this._pointer?.exportDate || null;
    }

    exportDb() {
        const now = Date.now();
        if (this._exportDb && now - this._pointerCheckedAt < this.pollMs) return this._exportDb;
        this._pointerCheckedAt = now;

        const pointer = this._readPointer();
        if (!pointer) return this._exportDb; // keep serving the old handle if the pointer vanished briefly
        if (this._exportDb && this._pointer?.version === pointer.version) return this._exportDb;

        const file = path.join(this.dir, pointer.file);
        let db;
        try {
            db = new DatabaseSync(file, { readOnly: true });
        } catch {
            return this._exportDb;
        }
        const old = this._exportDb;
        this._exportDb = db;
        this._pointer = pointer;
        if (old) {
            // Sync API: nothing can be mid-query on `old` once we are here. Close right away.
            this._stmts.delete(old);
            try {
                old.close();
            } catch {
                /* ignore */
            }
        }
        this.onSwitch?.(pointer);
        return db;
    }

    liveDb({ create = false } = {}) {
        if (this._liveDb) return this._liveDb;
        const file = path.join(this.dir, 'live.db');
        if (!create && !fs.existsSync(file)) return null;
        fs.mkdirSync(this.dir, { recursive: true });
        const db = new DatabaseSync(file);
        db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
        db.exec(SCHEMA_LIVE);
        this._liveDb = db;
        return db;
    }

    _stmt(db, sql) {
        let m = this._stmts.get(db);
        if (!m) this._stmts.set(db, (m = new Map()));
        let s = m.get(sql);
        if (!s) m.set(sql, (s = db.prepare(sql)));
        return s;
    }

    close() {
        for (const db of [this._exportDb, this._liveDb]) {
            try {
                db?.close();
            } catch {
                /* ignore */
            }
        }
        this._exportDb = this._liveDb = null;
    }

    // ── Queries ────────────────────────────────────────────────────────────

    getPerson(wcaId) {
        const db = this.exportDb();
        if (!db) return null;
        return this._stmt(db, 'SELECT wca_id, name, country_id FROM persons WHERE wca_id = ?').get(wcaId) || null;
    }

    /**
     * Most recent results of one event, newest first. `limit` null = everything.
     * Only the requested event is read (the old code loaded every result of every event of
     * the person - attempts included - and sorted them in JS for every single request).
     */
    getEventResults(wcaId, eventId, { limit = null, offset = 0 } = {}) {
        const db = this.exportDb();
        if (!db) return [];
        const rows = this._stmt(
            db,
            `SELECT competition_id, event_id, round_type_id, pos, best, average, format_id,
                    regional_single_record, regional_average_record, a1, a2, a3, a4, a5
             FROM results WHERE person_id = ? AND event_id = ?
             ORDER BY comp_date DESC, round_order DESC, id DESC
             LIMIT ? OFFSET ?`,
        ).all(wcaId, eventId, limit ?? -1, offset);
        return rows.map((r) => ({
            competition_id: r.competition_id,
            event_id: r.event_id,
            round_type_id: r.round_type_id,
            pos: r.pos,
            best: r.best,
            average: r.average,
            format_id: r.format_id,
            regional_single_record: r.regional_single_record,
            regional_average_record: r.regional_average_record,
            attempts: unpackAttempts(r),
        }));
    }

    /** Last `count` valid solves (centiseconds), newest first, reading results in small chunks. */
    getRecentSolves(wcaId, eventId, count) {
        const out = [];
        const CHUNK = 40;
        for (let offset = 0; out.length < count; offset += CHUNK) {
            const rows = this.getEventResults(wcaId, eventId, { limit: CHUNK, offset });
            if (rows.length === 0) break;
            for (const r of rows) {
                // attempts are stored chronologically; newest first means reversed
                for (let i = r.attempts.length - 1; i >= 0; i--) {
                    if (r.attempts[i] > 0) out.push(r.attempts[i]);
                }
            }
            if (rows.length < CHUNK) break;
        }
        return out.slice(0, count);
    }

    getPersonalRecords(wcaId) {
        const db = this.exportDb();
        const records = {};
        if (!db) return records;
        for (const { event_id, best } of this._stmt(db, 'SELECT event_id, best FROM ranks_single WHERE person_id = ?').all(wcaId)) {
            records[event_id] = { single: { best } };
        }
        for (const { event_id, best } of this._stmt(db, 'SELECT event_id, best FROM ranks_average WHERE person_id = ?').all(wcaId)) {
            (records[event_id] ||= {}).average = { best };
        }
        return records;
    }

    /** Competitions overlapping [startInt, endInt] from export + live DB (live wins on id). */
    getCompetitions({ startInt, endInt, country = null, query = null }) {
        const sql = `SELECT competition_id, name, country_id, start_date, end_date FROM competitions
                     WHERE end_date >= ? AND start_date <= ?
                       AND (? IS NULL OR country_id = ?)
                       AND (? IS NULL OR name LIKE ? ESCAPE '\\')
                     ORDER BY start_date`;
        const like = query ? `%${String(query).replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
        const args = [startInt, endInt, country, country, like, like];
        const byId = new Map();
        const exportDb = this.exportDb();
        if (exportDb) for (const r of this._stmt(exportDb, sql).all(...args)) byId.set(r.competition_id, r);
        const live = this.liveDb();
        if (live) for (const r of this._stmt(live, sql).all(...args)) byId.set(r.competition_id, r);
        return [...byId.values()].sort((a, b) => a.start_date - b.start_date);
    }

    counts() {
        const db = this.exportDb();
        if (!db) return {};
        const n = (t) => this._stmt(db, `SELECT COUNT(*) AS n FROM ${t}`).get().n;
        return { personCount: n('persons'), resultCount: n('results'), competitionCount: n('competitions') };
    }
}
