import { CubingCore } from '../lib/cubing-core.js';

/**
 * Pure statistics used by the round-analysis feature. Extracted from WcaApi so the same
 * code runs on the main thread, in worker threads and in unit tests.
 */

export function centisecondsToSeconds(cs) {
    if (cs === null || cs === undefined || cs <= 0) return null;
    return cs / 100;
}

// One implementation shared with the browser tools (public/js/cubingCore.js).
export function normCdf(z) {
    return CubingCore.normalCdf(z);
}

export function normalPdf(x, mu, sigma) {
    if (!sigma || sigma <= 0) return x === mu ? Infinity : 0;
    const z = (x - mu) / sigma;
    return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
}

export function buildDistribution(samples, { type = null, minSamples = 1 } = {}) {
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

export function buildLiveDistribution(observedTime, { historicalStdDev = null, scale = 1, fallbackFraction = 0.02 } = {}) {
    if (!Number.isFinite(observedTime) || observedTime <= 0) return null;
    return {
        mean: observedTime,
        stdDev: historicalStdDev ? historicalStdDev * scale : observedTime * fallbackFraction,
        sampleSize: 1,
        type: 'live',
        recentSamples: [observedTime],
    };
}

/**
 * Profile from a competitor's most recent results of one event.
 * `recentResults` are rows in chronological order (oldest first), each with {average, best}.
 */
export function buildPerformanceProfile(recentResults) {
    if (!recentResults || recentResults.length === 0) return null;
    const averages = recentResults
        .map((r) => centisecondsToSeconds(r.average))
        .filter((v) => v !== null && v > 0);
    if (averages.length > 0) return buildDistribution(averages, { type: 'average' });
    const singles = recentResults
        .map((r) => centisecondsToSeconds(r.best))
        .filter((v) => v !== null && v > 0);
    return buildDistribution(singles, { type: 'single' });
}

export function calculateTimeProbability(distribution, time, { tolerance = 0.5 } = {}) {
    if (!distribution || !Number.isFinite(time)) return null;
    const { mean, stdDev, sampleSize } = distribution;
    const probabilityFasterThanOrEqual = normCdf((time - mean) / stdDev);
    const probabilityWithinTolerance =
        normCdf((time + tolerance - mean) / stdDev) - normCdf((time - tolerance - mean) / stdDev);
    return {
        time,
        mostLikelyTime: mean,
        stdDev,
        sampleSize,
        tolerance,
        density: normalPdf(time, mean, stdDev),
        probabilityFasterThanOrEqual,
        probabilitySlowerThan: 1 - probabilityFasterThanOrEqual,
        probabilityWithinTolerance,
    };
}

export function probXBeatsY(pX, pY) {
    const diff = {
        mean: pX.mean - pY.mean,
        stdDev: Math.sqrt(pX.stdDev ** 2 + pY.stdDev ** 2),
        sampleSize: Math.min(pX.sampleSize || 1, pY.sampleSize || 1),
    };
    const r = calculateTimeProbability(diff, 0);
    return r ? r.probabilityFasterThanOrEqual : 0.5;
}

/** Small deterministic PRNG so Monte-Carlo output is reproducible in tests. */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Round ranking with win/podium/top-8 probabilities.
 *
 * Complexity note: the old version built an n x n win matrix of pairwise probabilities as
 * an array of arrays and exposed it per competitor (O(n^2) objects in the response). That is
 * kept, but the Monte-Carlo loop no longer allocates/sorts closures per simulation: it fills a
 * typed array and sorts an index array, which is ~3-4x faster for 200+ competitors.
 *
 * @param {Map<string,{name:string,countryIso2?:string,profile:object|null}>} profiles
 */
export function computeRoundRankings(profiles, { sims = 2000, rng = Math.random } = {}) {
    const valid = [];
    for (const [wcaId, entry] of profiles.entries()) {
        if (entry?.profile && !entry.profile.error) {
            valid.push({ wcaId, name: entry.name, countryIso2: entry.countryIso2 || null, profile: entry.profile });
        }
    }
    const n = valid.length;
    if (n === 0) return [];

    const winMatrix = valid.map((a) =>
        valid.map((b) => (a.wcaId === b.wcaId ? 0 : probXBeatsY(a.profile, b.profile))),
    );

    const win = new Uint32Array(n);
    const podium = new Uint32Array(n);
    const top8 = new Uint32Array(n);
    const times = new Float64Array(n);
    const order = Array.from({ length: n }, (_, i) => i);
    const mean = valid.map((v) => v.profile.mean);
    const sd = valid.map((v) => v.profile.stdDev);

    for (let s = 0; s < sims; s++) {
        for (let i = 0; i < n; i++) {
            const u1 = 1 - rng();
            const u2 = 1 - rng();
            const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            times[i] = Math.max(mean[i] + z * sd[i], 0.01);
        }
        order.sort((a, b) => times[a] - times[b]);
        for (let rank = 0; rank < Math.min(n, 8); rank++) {
            const i = order[rank];
            if (rank === 0) win[i]++;
            if (rank < 3) podium[i]++;
            top8[i]++;
        }
    }

    return valid
        .map((c, i) => ({
            wcaId: c.wcaId,
            name: c.name,
            expectedResult: c.profile.mean,
            countryIso2: c.countryIso2,
            profile: c.profile,
            winProbability: win[i] / sims,
            podiumProbability: podium[i] / sims,
            top8Probability: top8[i] / sims,
            pairwiseWinRates: Object.fromEntries(valid.map((b, j) => [b.wcaId, winMatrix[i][j]])),
        }))
        .sort((a, b) => a.expectedResult - b.expectedResult);
}

/**
 * Trimmed average of centisecond solves, in seconds, dropping 5 % (at least one) from each end -
 * identical to csTimer's "ao n" and to what the tools compute locally (CubingCore.trimmedAverage).
 * For 12 solves that is still best+worst; for 25 it is 2+2 (it used to stay at 1+1 for any n).
 *
 * Contract kept for existing clients: no solves -> null, 1-2 solves -> 0 (too few to trim), else the mean.
 * Use averageOrNull() when "not enough data" must be distinguishable from a real value.
 */
export function calculateAverage(solves) {
    if (!solves || solves.length === 0) return null;
    return averageOrNull(solves) ?? 0;
}

/** Same as calculateAverage but returns null (not 0) when there are fewer than 3 solves. */
export function averageOrNull(solves) {
    if (!solves || solves.length < 3) return null;
    const result = CubingCore.trimmedAverage(solves.map((cs) => cs / 100));
    return Number.isFinite(result) ? result : null;
}
