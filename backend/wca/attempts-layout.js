import fs from 'fs';

const PERMS = [
    [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
]; // [resultIdCol, attemptNumberCol, valueCol]

const isInt = (s) => /^-?\d+$/.test(s);

/**
 * result_attempts.tsv columns are not self-evident (the README lists the fields but not their
 * order, and v2.0.2 removed three of them). Instead of hard-coding an order - which silently
 * produced a database with no attempts when it was wrong - infer it from the data:
 *
 *   header present        -> use the column names
 *   otherwise, for each of the 6 column orders score a sample of rows by
 *     * how many "result id" values exist in the results we just imported,
 *     * how many "attempt number" values are small integers (0..255),
 *     * how few (result id, attempt number) pairs collide (a real pair is unique).
 *   A wrong order scores low on at least one of these (e.g. centisecond values collide heavily).
 *
 * @param {string} file
 * @param {(id:number)=>boolean} hasResultId
 */
export function detectAttemptLayout(file, hasResultId, { sampleRows = 20_000 } = {}) {
    const fd = fs.openSync(file, 'r');
    let text;
    try {
        const buf = Buffer.alloc(2 * 1024 * 1024);
        text = buf.toString('utf8', 0, fs.readSync(fd, buf, 0, buf.length, 0));
    } finally {
        fs.closeSync(fd);
    }
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 1) throw new Error('result_attempts.tsv is empty');
    lines.pop(); // last line may be cut off by the 2 MB read
    const first = lines[0].split('\t');

    if (first.some((f) => !isInt(f))) {
        const idx = Object.fromEntries(first.map((n, i) => [n.trim(), i]));
        const missing = ['result_id', 'attempt_number', 'value'].filter((n) => !(n in idx));
        if (missing.length) throw new Error(`result_attempts.tsv header [${first.join(', ')}] lacks column(s) ${missing.join(', ')}`);
        return { hasHeader: true, idCol: idx.result_id, nCol: idx.attempt_number, vCol: idx.value, nBase: 1, detected: 'header' };
    }

    const rows = lines
        .slice(0, sampleRows)
        .map((l) => l.split('\t'))
        .filter((f) => f.length >= 3 && f.slice(0, 3).every(isInt))
        .map((f) => f.slice(0, 3).map(Number));
    if (rows.length < 5) throw new Error(`result_attempts.tsv: too few parsable rows to detect the column order (first line: [${first.join(', ')}])`);

    const scored = PERMS.map(([i, n, v]) => {
        let nOk = 0;
        let hit = 0;
        const keys = new Set();
        const ns = new Set();
        for (const r of rows) {
            if (r[n] >= 0 && r[n] <= 255) nOk++;
            if (hasResultId(r[i])) hit++;
            keys.add(`${r[i]}:${r[n]}`);
            ns.add(r[n]);
        }
        const total = rows.length;
        const uniq = keys.size / total;
        return { perm: [i, n, v], score: (nOk / total) * (hit / total) * uniq, nDistinct: ns.size, min: Math.min(...rows.map((r) => r[n])) };
    }).sort((a, b) => b.score - a.score || a.nDistinct - b.nDistinct);

    const [best, second] = scored;
    const sample = rows.slice(0, 3).map((r) => `[${r.join(', ')}]`).join(' ');
    if (best.score < 0.9) {
        throw new Error(`result_attempts.tsv: cannot match any column order to the imported results (best score ${best.score.toFixed(2)}). Sample rows: ${sample}`);
    }
    if (second.score > 0.9 * best.score && second.nDistinct <= best.nDistinct) {
        throw new Error(`result_attempts.tsv: column order is ambiguous (scores ${best.score.toFixed(2)} vs ${second.score.toFixed(2)}). Sample rows: ${sample}`);
    }
    const [idCol, nCol, vCol] = best.perm;
    return { hasHeader: false, idCol, nCol, vCol, nBase: best.min === 0 ? 0 : 1, detected: `data (score ${best.score.toFixed(2)})` };
}
