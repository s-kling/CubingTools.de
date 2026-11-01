import { createReadStream } from 'fs';
import { Transform } from 'stream';

/**
 * Stream-parse a TSV file. rowFn(fields) is called for each data row.
 *
 * A manual Transform is used instead of readline's async iterator, which silently
 * stopped early on very large files under backpressure (seen on Node >= 22). Resolution
 * happens on 'finish', i.e. only after flush() ran, so truncation cannot go unnoticed.
 *
 * `hasHeader`: when true the first line is passed to onHeader() instead of rowFn().
 */
export function parseTsv(filePath, { rowFn, onHeader = null, hasHeader = true, onProgress = null, signal = null, progressEvery = 100_000 }) {
    return new Promise((resolve, reject) => {
        const decoder = new TextDecoder('utf-8');
        let remainder = '';
        let headerDone = !hasHeader;
        let rows = 0;

        const handleLine = (line) => {
            if (!line) return;
            const fields = line.split('\t');
            if (!headerDone) {
                headerDone = true;
                onHeader?.(fields);
                return;
            }
            rowFn(fields);
            rows++;
            if (onProgress && rows % progressEvery === 0) onProgress(rows);
        };

        const transform = new Transform({
            transform(chunk, _enc, cb) {
                if (signal?.aborted) return cb(new Error('Refresh cancelled'));
                try {
                    remainder += decoder.decode(chunk, { stream: true });
                    let start = 0;
                    let nl;
                    while ((nl = remainder.indexOf('\n', start)) !== -1) {
                        const end = nl > start && remainder[nl - 1] === '\r' ? nl - 1 : nl;
                        handleLine(remainder.slice(start, end));
                        start = nl + 1;
                    }
                    remainder = remainder.slice(start);
                    cb();
                } catch (e) {
                    cb(e);
                }
            },
            flush(cb) {
                try {
                    handleLine(remainder.endsWith('\r') ? remainder.slice(0, -1) : remainder);
                    remainder = '';
                    cb();
                } catch (e) {
                    cb(e);
                }
            },
        });

        const abort = () => transform.destroy(new Error('Refresh cancelled'));
        signal?.addEventListener('abort', abort, { once: true });
        const done = () => signal?.removeEventListener('abort', abort);
        transform.on('finish', () => (done(), resolve(rows)));
        transform.on('error', (e) => (done(), reject(e)));
        const src = createReadStream(filePath);
        src.on('error', (e) => (done(), reject(e)));
        src.pipe(transform);
    });
}

/** Header name -> index map; throws a descriptive error if required columns are missing. */
export function buildColumnMap(header, required) {
    const map = {};
    header.forEach((name, i) => (map[String(name).trim()] = i));
    const missing = required.filter((n) => !(n in map));
    if (missing.length) {
        throw new Error(
            `WCA export schema mismatch: missing column(s) [${missing.join(', ')}] in header [${header.join(', ')}]. ` +
                'The export format may have changed - see https://www.worldcubeassociation.org/export/results',
        );
    }
    return map;
}

/**
 * Multi-row INSERT helper. One prepared statement binds `batch` rows at once, which cuts the
 * JS->SQLite call count by ~2 orders of magnitude versus one run() per row (the dominant cost
 * when importing ~40M rows).
 */
export class BatchInserter {
    constructor(db, table, columns, { batch = 200, verb = 'INSERT OR REPLACE' } = {}) {
        this.db = db;
        this.n = columns.length;
        this.batch = batch;
        const one = `(${columns.map(() => '?').join(',')})`;
        this.head = `${verb} INTO ${table} (${columns.join(',')}) VALUES `;
        this.full = db.prepare(this.head + Array(batch).fill(one).join(','));
        this.one = db.prepare(this.head + one);
        this.buf = [];
        this.count = 0;
    }
    add(...values) {
        for (const v of values) this.buf.push(v);
        this.count++;
        if (this.buf.length === this.n * this.batch) {
            this.full.run(...this.buf);
            this.buf.length = 0;
        }
    }
    flush() {
        for (let i = 0; i < this.buf.length; i += this.n) this.one.run(...this.buf.slice(i, i + this.n));
        this.buf.length = 0;
        return this.count;
    }
}
