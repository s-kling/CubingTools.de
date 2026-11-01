import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { WcaStore, toDateInt, fromDateInt } from '../../wca/store.js';
import {
    centisecondsToSeconds,
    buildDistribution,
    buildLiveDistribution,
    buildPerformanceProfile,
    calculateTimeProbability,
    calculateAverage,
    computeRoundRankings,
    normCdf,
    probXBeatsY,
} from '../../wca/stats.js';

const COLOR = { reset: '\x1b[0m', cyan: '\x1b[36m', yellow: '\x1b[33m', red: '\x1b[31m' };
const canColor = process.stdout && process.stdout.isTTY;
const paint = (c, t) => (canColor ? `${c}${t}${COLOR.reset}` : t);
const logger = {
    info: (...a) => console.log(paint(COLOR.cyan, '[WcaApi]'), ...a),
    warn: (...a) => console.warn(paint(COLOR.yellow, '[WcaApi]'), ...a),
    error: (...a) => console.error(paint(COLOR.red, '[WcaApi]'), ...a),
};

const NOT_READY = 'WCA data is being prepared. Please try again in a few minutes.';

/**
 * WcaApi - the READ side of everything WCA related, used by the logic workers.
 *
 * Historical data comes from the immutable SQLite export published by the jobs process
 * (see backend/wca/importer.js + store.js); this class never downloads, imports or swaps
 * databases. Heavy work (profile building from SQL, Monte-Carlo ranking) is delegated to a
 * worker-thread pool when one is supplied, so a 300-competitor analysis cannot stall other
 * requests on the same worker. Admin refresh/cancel are requests written to the control
 * directory; the jobs process executes them.
 */
export default class WcaApi {
    constructor({ store = new WcaStore(), pool = null, http = axios } = {}) {
        this.store = store;
        this.pool = pool;
        this.http = http;
        this.competitionsUrl = 'https://www.worldcubeassociation.org/api/v0/competitions';
        this.wcaLiveUrl = 'https://live.worldcubeassociation.org/api';

        // Network response caches (WCIF / live).
        this.cacheTtlMs = 5 * 60 * 1000;
        this.wcifCacheTtlMs = 2 * 60 * 1000;
        this.responseCache = new Map();

        this.maxConcurrentPersonFetches = 20;

        // Historical profile cache keyed "<wcaId>:<eventId>", bounded (it was an unbounded
        // per-competition Map that only ever grew) and dropped whenever a new export lands.
        this.profileCache = new Map();
        this.profileCacheMax = 20_000;
        this.profileCacheVersion = null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Cache helpers
    // ═══════════════════════════════════════════════════════════════════════

    normalizeWcaId(wcaId) {
        return String(wcaId || '').trim().toUpperCase();
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

    _profileCacheGet(key) {
        const version = this.store.version();
        if (version !== this.profileCacheVersion) {
            this.profileCache.clear();
            this.profileCacheVersion = version;
        }
        if (!this.profileCache.has(key)) return undefined;
        const v = this.profileCache.get(key);
        this.profileCache.delete(key); // LRU: move to the end
        this.profileCache.set(key, v);
        return v;
    }

    _profileCacheSet(key, value) {
        this.profileCache.set(key, value);
        if (this.profileCache.size > this.profileCacheMax) {
            this.profileCache.delete(this.profileCache.keys().next().value);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Network cache + concurrency
    // ═══════════════════════════════════════════════════════════════════════

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

    centisecondsToSeconds(cs) {
        return centisecondsToSeconds(cs);
    }

    _today() {
        return new Date().toISOString().slice(0, 10);
    }

    isOngoing(competition) {
        const today = this._today();
        return competition.start_date <= today && today <= competition.end_date;
    }

    isFuture(competition) {
        return competition.start_date > this._today();
    }

    // Kept for API compatibility with the old class.
    _buildLiveDistribution(observedTime, options = {}) {
        return buildLiveDistribution(observedTime, options);
    }

    computeRoundRankings(profiles, options = {}) {
        return computeRoundRankings(profiles, options);
    }

    /** Ranking on the worker pool when available, otherwise inline. */
    async _rank(profileMap) {
        if (!this.pool) return computeRoundRankings(profileMap);
        return this.pool.run('rankings', { profiles: [...profileMap.entries()] });
    }

    /** Historical profiles for many people at once (SQL + stats off the request thread). */
    async _historicalProfiles(wcaIds, eventId) {
        const out = new Map();
        const missing = [];
        for (const id of wcaIds) {
            const hit = this._profileCacheGet(`${id}:${eventId}`);
            if (hit !== undefined) out.set(id, hit);
            else missing.push(id);
        }
        if (missing.length === 0) return out;

        const CHUNK = 25;
        const chunks = [];
        for (let i = 0; i < missing.length; i += CHUNK) chunks.push(missing.slice(i, i + CHUNK));
        await this._pooled(
            chunks.map((ids) => async () => {
                const rows = this.pool
                    ? await this.pool.run('profiles', { wcaIds: ids, eventId })
                    : ids.map((wcaId) => this._profileInline(wcaId, eventId));
                for (const r of rows) {
                    // Errors are not cached so the next request can retry them.
                    if (!r.error) this._profileCacheSet(`${r.wcaId}:${eventId}`, r.profile);
                    out.set(r.wcaId, r.error ? { error: r.error } : r.profile);
                }
            }),
            this.pool ? this.pool.size : 1,
        );
        return out;
    }

    _profileInline(wcaId, eventId) {
        if (!this.store.getPerson(wcaId)) return { wcaId, profile: null, error: `WCA ID not found in export: ${wcaId}` };
        const rows = this.store.getEventResults(wcaId, eventId, { limit: 12 }).reverse();
        return { wcaId, profile: buildPerformanceProfile(rows) };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Person / competitor data
    // ═══════════════════════════════════════════════════════════════════════

    getPersonalRecords(wcaId, event) {
        const rec = this.store.getPersonalRecords(wcaId)[event];
        return { single: rec?.single?.best || null, average: rec?.average?.best || null };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Competition listing
    // ═══════════════════════════════════════════════════════════════════════

    async fetchUpcomingCompetitions(options = {}) {
        const today = this._today();
        const ninetyDaysOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const { start = today, end = ninetyDaysOut, countryIso2 = null, query = null } = options;
        const isoDay = /^\d{4}-\d{2}-\d{2}$/;
        if (!isoDay.test(start) || !isoDay.test(end)) throw Object.assign(new Error('start/end must be YYYY-MM-DD'), { status: 400 });

        // Overlap semantics: a three-day competition that started yesterday is still "ongoing"
        // today. The old query only matched competitions that START inside the window, so
        // ongoing competitions never appeared with the default window and the 'ongoing' status
        // sort below was dead code.
        const rows = this.store.getCompetitions({
            startInt: toDateInt(start),
            endInt: toDateInt(end),
            country: countryIso2,
            query,
        });
        return rows
            .map((r) => {
                const c = {
                    id: r.competition_id,
                    name: r.name,
                    country_iso2: r.country_id,
                    start_date: fromDateInt(r.start_date),
                    end_date: fromDateInt(r.end_date),
                    source: 'database',
                };
                return { ...c, status: this.isOngoing(c) ? 'ongoing' : this.isFuture(c) ? 'upcoming' : 'past' };
            })
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
                const { data } = await this.http.get(
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
        const { data } = await this.http.post(
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
    // HTTP request handlers
    // ═══════════════════════════════════════════════════════════════════════

    async handleCompetitionsRequest(req, res) {
        const { start, end, country, q } = req.query;
        try {
            return res.json(
                await this.fetchUpcomingCompetitions({
                    start: typeof start === 'string' ? start : undefined,
                    end: typeof end === 'string' ? end : undefined,
                    countryIso2: typeof country === 'string' && country ? country.toUpperCase() : null,
                    query: typeof q === 'string' && q ? q.slice(0, 100) : null,
                }),
            );
        } catch (error) {
            return res.status(error.status || 500).json({ error: error.message });
        }
    }

    async handleCompetitionOverviewRequest(req, res) {
        const { id } = req.params;
        try {
            const [wcif, isLive] = await Promise.all([this.fetchWcif(id), this.isLiveInWcaLive(id)]);
            // Previously isOngoing() was called without an end date, so every competition
            // was reported as 'upcoming'.
            const startDate = wcif.schedule?.startDate;
            const days = Number(wcif.schedule?.numberOfDays) || 1;
            let status = 'upcoming';
            if (startDate) {
                const end = new Date(`${startDate}T00:00:00Z`);
                end.setUTCDate(end.getUTCDate() + days - 1);
                const c = { start_date: startDate, end_date: end.toISOString().slice(0, 10) };
                status = this.isOngoing(c) ? 'ongoing' : this.isFuture(c) ? 'upcoming' : 'past';
            }
            return res.json({
                id,
                name: wcif.name,
                status,
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

                    // Historical profiles for everyone (cached, computed off-thread).
                    const hist = await this._historicalProfiles(
                        allWithId.map((c) => this.normalizeWcaId(c.wcaId)),
                        eventId,
                    );
                    const allProfileMap = new Map();
                    for (const c of allWithId) {
                        const norm = this.normalizeWcaId(c.wcaId);
                        const h = hist.get(norm);
                        allProfileMap.set(norm, { name: c.name, profile: h && !h.error ? h : null });
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

            // Historical profiles are fetched in chunks so the client sees progress events as
            // soon as each chunk is ready, while the SQL + math run on the worker pool.
            const ids = withId.map((c) => this.normalizeWcaId(c.wcaId));
            const byId = new Map(withId.map((c) => [this.normalizeWcaId(c.wcaId), c]));
            const emit = (idNorm, historical) => {
                const competitor = byId.get(idNorm);
                const failed = historical?.error;
                let profile = failed ? null : historical || null;

                // For subsequent rounds a real previous-round result is more relevant than
                // the historical mean; keep the (scaled-down) historical spread.
                if (prevRoundId && liveResults?.[eventId]?.[prevRoundId]) {
                    const prevLe = liveResults[eventId][prevRoundId].find((r) => r.wcaId === idNorm);
                    if (prevLe) {
                        const prevResult = this.centisecondsToSeconds(prevLe.average > 0 ? prevLe.average : prevLe.best);
                        if (prevResult) {
                            profile = this._buildLiveDistribution(prevResult, {
                                historicalStdDev: profile?.stdDev,
                                scale: 0.7,
                                fallbackFraction: 0.04,
                            });
                        }
                    }
                }

                // Current-round live result has the highest priority.
                if (liveResults?.[eventId]?.[roundId]) {
                    const le = liveResults[eventId][roundId].find((r) => r.wcaId === idNorm);
                    if (le) {
                        const result = this.centisecondsToSeconds(le.average > 0 ? le.average : le.best);
                        if (result) {
                            profile = this._buildLiveDistribution(result, {
                                historicalStdDev: failed ? undefined : historical?.stdDev,
                                scale: 0.5,
                                fallbackFraction: 0.02,
                            });
                        }
                    }
                }

                profileMap.set(idNorm, { name: competitor.name, countryIso2: competitor.countryIso2 || null, profile });
                const evt = { type: 'profile', wcaId: competitor.wcaId, name: competitor.name, country: competitor.countryIso2 || null, profile: profile || null };
                if (failed) {
                    logger.warn(`Profile failed for ${idNorm} (${competitor.name}) in ${id}/${eventId}: ${failed}`);
                    evt.error = failed;
                }
                send(evt);
            };

            const CHUNK = 25;
            const chunkTasks = [];
            for (let i = 0; i < ids.length; i += CHUNK) {
                const part = ids.slice(i, i + CHUNK);
                chunkTasks.push(async () => {
                    const hist = await this._historicalProfiles(part, eventId);
                    for (const idNorm of part) emit(idNorm, hist.get(idNorm));
                });
            }
            await this._pooled(chunkTasks, this.pool ? this.pool.size : 1);

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
                rankings: await this._rank(profileMap),
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

    // ═══════════════════════════════════════════════════════════════════════
    // Refresh / status endpoints (executed by the jobs process via control files)
    // ═══════════════════════════════════════════════════════════════════════

    get controlDir() {
        return path.join(this.store.dir, 'control');
    }

    _readStatus() {
        try {
            return JSON.parse(fs.readFileSync(path.join(this.controlDir, 'status.json'), 'utf8'));
        } catch {
            return null;
        }
    }

    _touchControl(name) {
        fs.mkdirSync(this.controlDir, { recursive: true });
        fs.writeFileSync(path.join(this.controlDir, name), new Date().toISOString());
    }

    async handleForceRefreshRequest(req, res) {
        if (this._readStatus()?.refreshing) return res.status(409).json({ error: 'Refresh already in progress' });
        try {
            this._touchControl('refresh.request');
            return res.json({ status: 'refresh_started' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    async handleCancelRefreshRequest(req, res) {
        if (!this._readStatus()?.refreshing) return res.status(409).json({ error: 'No refresh in progress' });
        try {
            this._touchControl('cancel.request');
            return res.json({ status: 'cancellation_requested' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    async handleMetadataRequest(req, res) {
        const status = this._readStatus();
        const exportDate = this.store.exportDate();
        const counts = this.store.counts();
        const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
        return res.json({
            exportDate,
            nextScheduledCheck: exportDate ? new Date(new Date(exportDate).getTime() + maxAgeMs).toISOString() : null,
            isRefreshing: Boolean(status?.refreshing),
            refreshState: status?.state || null,
            refreshProgress: status?.progress || null,
            lastError: status?.lastError || null,
            personCount: counts.personCount ?? null,
            resultCount: counts.resultCount ?? null,
            competitionCount: counts.competitionCount ?? null,
        });
    }

    /**
     * GET /api/wca/:wcaId/:event
     *  - event "name"          -> { name }
     *  - ?getsolves=true       -> every valid solve ever, newest first
     *  - ?getaverages=true     -> every competition average, oldest first
     *  - default               -> trimmed mean of the last `num` solves + personal records
     */
    async handleRequest(req, res) {
        const { wcaId, event } = req.params;
        const { num, getsolves, getaverages } = req.query;

        const normalizedId = this.normalizeWcaId(wcaId);
        if (!this.isValidWcaId(normalizedId)) return res.status(400).json({ error: 'Invalid WCA ID format' });
        if (!/^[a-z0-9]{2,12}$/i.test(event)) return res.status(400).json({ error: 'Invalid event' });
        if (!this.store.isReady()) return res.status(503).set('Retry-After', '60').json({ error: NOT_READY });

        try {
            const person = this.store.getPerson(normalizedId);
            if (!person) return res.status(404).json({ error: `WCA ID not found in export: ${normalizedId}` });
            if (event === 'name') return res.json({ name: person.name });

            if (getsolves) {
                const rows = this.store.getEventResults(normalizedId, event); // newest first
                return res.json({ allResults: rows.flatMap((r) => this.filterAttempts([...r.attempts].reverse())) });
            }
            if (getaverages) {
                const rows = this.store.getEventResults(normalizedId, event).reverse();
                return res.json({ allAverages: rows.map((r) => r.average) });
            }

            const rawNum = Number.parseInt(num, 10);
            const solvecount = Number.isFinite(rawNum) && rawNum > 0 ? Math.min(rawNum, 200) : 12;
            return res.json({
                average: calculateAverage(this.store.getRecentSolves(normalizedId, event, solvecount)),
                records: this.getPersonalRecords(normalizedId, event),
            });
        } catch (error) {
            logger.error('request failed:', error.message);
            return res.status(500).json({ error: error.message });
        }
    }
}
