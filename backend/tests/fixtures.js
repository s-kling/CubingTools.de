import fs from 'fs';
import path from 'path';

/** Writes a tiny but schema-faithful WCA v2 TSV export and returns its directory. */
export function writeTsvFixture(dir, { shuffleAttempts = false, layout = 'id-n-v' } = {}) {
    fs.mkdirSync(dir, { recursive: true });
    const w = (name, lines) => fs.writeFileSync(path.join(dir, name), lines.join('\n') + '\n');

    w('WCA_export_competitions.tsv', [
        ['id', 'name', 'country_id', 'year', 'month', 'day', 'end_year', 'end_month', 'end_day', 'extra'].join('\t'),
        ['Early2024', 'Early 2024', 'DE', 2024, 1, 10, 2024, 1, 10, 'x'].join('\t'),
        ['Late2024', 'Late 2024', 'DE', 2024, 6, 1, 2024, 6, 2, 'x'].join('\t'),
        ['Abroad2024', 'Abroad Open 2024', 'FR', 2024, 7, 1, 2024, 7, 1, 'x'].join('\t'),
    ]);
    w('WCA_export_persons.tsv', [
        ['name', 'wca_id', 'sub_id', 'country_id', 'gender'].join('\t'),
        ['Old Name', '2015TEST01', 2, 'CN', 'm'].join('\t'),   // older row: must NOT win
        ['Alice Test', '2015TEST01', 1, 'DE', 'f'].join('\t'),
        ['Bob Other', '2016OTHR01', 1, 'FR', 'm'].join('\t'),
    ]);
    // result ids deliberately not in chronological order
    const res = [
        // id person comp event round pos best average format recS recA
        [30, '2015TEST01', 'Late2024', '333', 'c', 1, 800, 900, 'a'],
        [10, '2015TEST01', 'Early2024', '333', 'c', 2, 1000, 1100, 'a'],
        [20, '2015TEST01', 'Late2024', '333', '1', 3, 850, 950, 'a'], // first round of the SAME comp as id 30
        [40, '2016OTHR01', 'Abroad2024', '333', 'c', 1, 700, 750, 'a'],
        [50, '2015TEST01', 'Late2024', '222', 'c', 1, 200, 250, 'a'],
    ];
    w('WCA_export_results.tsv', [
        ['id', 'person_id', 'competition_id', 'event_id', 'round_type_id', 'pos', 'best', 'average', 'format_id', 'regional_single_record', 'regional_average_record'].join('\t'),
        ...res.map((r) => [...r, '', ''].join('\t')),
    ]);
    const attempts = [
        [10, 1, 1000], [10, 2, 1100], [10, 3, 1200], [10, 4, 1050], [10, 5, -1],
        [20, 1, 900], [20, 2, 850], [20, 3, 1000], [20, 4, 950], [20, 5, 920],
        [30, 1, 800], [30, 2, 900], [30, 3, 1000], [30, 4, 850], [30, 5, 950],
        [40, 1, 700], [40, 2, 750], [40, 3, 800], [40, 4, 720], [40, 5, 780],
        [50, 1, 200], [50, 2, 250], [50, 3, 300], [50, 4, 0], [50, 5, 0],
    ].map((r) => {
        const [id, n, v] = r;
        if (layout === 'v-n-id') return [v, n, id].join('\t'); // value, attempt_number, result_id
        if (layout === 'n-id-v') return [n, id, v].join('\t');
        if (layout === 'header-shuffled') return [v, id, n].join('\t');
        return r.join('\t');
    });
    if (layout === 'header-shuffled') attempts.unshift(['value', 'result_id', 'attempt_number'].join('\t'));
    if (shuffleAttempts) attempts.reverse(); // file order must not matter
    w('WCA_export_result_attempts.tsv', attempts);
    w('WCA_export_ranks_single.tsv', [
        ['person_id', 'event_id', 'best', 'world_rank'].join('\t'),
        ['2015TEST01', '333', 800, 1].join('\t'),
        ['2015TEST01', '222', 200, 1].join('\t'),
    ]);
    w('WCA_export_ranks_average.tsv', [
        ['person_id', 'event_id', 'best', 'world_rank'].join('\t'),
        ['2015TEST01', '333', 900, 1].join('\t'),
    ]);
    return dir;
}
