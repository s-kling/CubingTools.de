/**
 * CubingCore - the single implementation of everything the tools (and the backend) need for
 * cubing arithmetic: parsing/formatting times, WCA averaging rules, rolling averages, escaping.
 *
 * Loaded as a classic script in the browser (window.CubingCore) and evaluated by the backend
 * (backend/lib/cubing-core.js), so a number computed in a tool and the same number computed on the
 * server can never drift apart again. Pure functions only - no DOM, no storage.
 *
 * Conventions
 *   - times are seconds (floats); DNF is Infinity
 *   - all arithmetic that ends up on screen is done in integer centiseconds, because that is what the
 *     WCA uses (and what avoids 0.1 + 0.2 style errors and toFixed() rounding surprises)
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CubingCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const DNF = Infinity;

    // ── Events ────────────────────────────────────────────────────────────
    // WCA Regulation 9b: Mean of 3 is the ranked average format for these events; every other event with an
    // average uses Average of 5. (333mbf has no average.) The tools used to keep three different lists.
    const MEAN_EVENTS = Object.freeze(['666', '777', '333bf', '444bf', '555bf', '333fm']);
    const isMeanEvent = (eventId) => MEAN_EVENTS.includes(eventId);
    const requiredSolves = (eventId) => (isMeanEvent(eventId) ? 3 : 5);

    // ── Basic helpers ─────────────────────────────────────────────────────
    const isDnf = (v) =>
        v === 'DNF' || v === -1 || v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v));

    /** seconds -> integer centiseconds (the epsilon keeps 1.005 style inputs from rounding down). */
    const toCs = (seconds) => Math.round(seconds * 100 + 1e-9);
    const fromCs = (cs) => cs / 100;

    // ── Parsing / formatting ──────────────────────────────────────────────

    /**
     * "DNF", "12.34", "1:02.34", "1:02:03.45" -> { seconds, isDnf, error }.
     * Negative numbers, NaN and anything else non-numeric are errors.
     */
    function parseTime(rawInput) {
        const input = String(rawInput ?? '').trim();
        if (!input) return { seconds: null, isDnf: false, error: 'Invalid time format' };
        if (input.toUpperCase() === 'DNF') return { seconds: null, isDnf: true, error: null };

        const parts = input.split(':');
        if (parts.length > 3 || parts.some((p) => !/^\d*\.?\d*$/.test(p) || p === '' || p === '.')) {
            return { seconds: null, isDnf: false, error: 'Invalid time format' };
        }
        const nums = parts.map(Number);
        if (nums.some((n) => !Number.isFinite(n))) return { seconds: null, isDnf: false, error: 'Invalid time format' };
        const seconds = nums.reduce((acc, n) => acc * 60 + n, 0);
        return { seconds, isDnf: false, error: null };
    }

    /**
     * Seconds -> "12.34" | "1:02.34" | "1:02:03.45". Rounds to centiseconds FIRST, so 59.996 becomes
     * "1:00.00" (not "60.00") and 119.996 becomes "2:00.00" (not "1:60.00").
     */
    function formatTime(seconds, { dnf = 'DNF' } = {}) {
        if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return dnf;
        return formatCentiseconds(toCs(Math.max(0, seconds)), { dnf });
    }

    function formatCentiseconds(cs, { dnf = 'DNF' } = {}) {
        if (typeof cs !== 'number' || !Number.isFinite(cs) || cs < 0) return dnf;
        const total = Math.round(cs);
        const hundredths = total % 100;
        const secsTotal = Math.floor(total / 100);
        const s = secsTotal % 60;
        const m = Math.floor(secsTotal / 60) % 60;
        const h = Math.floor(secsTotal / 3600);
        const two = (n) => String(n).padStart(2, '0');
        if (h > 0) return `${h}:${two(m)}:${two(s)}.${two(hundredths)}`;
        if (m > 0) return `${m}:${two(s)}.${two(hundredths)}`;
        return `${s}.${two(hundredths)}`;
    }

    /**
     * The "digits shift in from the right" input mask used by every time field
     * (typing 1,2,3,4 gives 0.01, 0.12, 1.23, 12.34; 5+ digits add minutes).
     * Letters mean DNF when allowDnf, otherwise they clear the field.
     */
    function formatTimeInputValue(current, { allowDnf = true } = {}) {
        let value = String(current ?? '');
        if (/[a-zA-Z]/.test(value)) {
            const last = value.slice(-1);
            if (/\d/.test(last)) value = last; // typing a digit after "DNF" starts a fresh number
            else return allowDnf ? 'DNF' : '';
        }
        let digits = value.replace(/[^0-9]/g, '').replace(/^0+/, '');
        if (digits.length > 8) digits = digits.slice(-8); // h:mm:ss.xx is the longest meaningful time
        digits = digits.padStart(3, '0');
        const cs = digits.slice(-2);
        const secsAll = digits.slice(0, -2);
        if (digits.length <= 4) {
            const out = `${secsAll}.${cs}`;
            return out === '0.00' ? '' : out;
        }
        // 5+ digits: minutes appear. secsAll has >= 3 digits, the last two are seconds.
        const sec = secsAll.slice(-2);
        const minutes = secsAll.slice(0, -2);
        return `${minutes}:${sec}.${cs}`;
    }

    // ── Averaging ─────────────────────────────────────────────────────────

    /** Number of results dropped from each end for an "average of n" (5 %, at least 1). 5->1, 12->1, 25->2, 100->5. */
    const trimCount = (n) => (n < 5 ? 0 : Math.max(1, Math.ceil(n * 0.05)));

    /**
     * Arithmetic mean in centisecond precision; DNF if any value is DNF. Returns null for no values.
     */
    function mean(values) {
        if (!values || values.length === 0) return null;
        if (values.some(isDnf)) return DNF;
        const sum = values.reduce((acc, v) => acc + toCs(v), 0);
        return fromCs(Math.round(sum / values.length));
    }

    /** Mean of the finite values only (session statistics deliberately ignore DNFs); null if there are none. */
    function meanOfFinite(values) {
        const finite = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
        return finite.length ? mean(finite) : null;
    }

    /**
     * Trimmed average ("average of n"): drop the `trim` fastest and `trim` slowest results, mean the rest.
     * DNFs count as the slowest results, so up to `trim` DNFs are tolerated - exactly the WCA Ao5 rule
     * (one DNF is dropped as the worst; two DNFs make the average a DNF).
     * @returns {number} seconds, or Infinity for DNF; null if there are fewer than 3 results
     */
    function trimmedAverage(values, trim = trimCount(values ? values.length : 0)) {
        if (!values || values.length < 3) return null;
        const sorted = values.map((v) => (isDnf(v) ? DNF : v)).sort((a, b) => a - b);
        const kept = sorted.slice(trim, sorted.length - trim);
        if (kept.length === 0) return null;
        if (kept.some((v) => !Number.isFinite(v))) return DNF;
        return mean(kept);
    }

    /**
     * The competition average for an event from its most recent solves:
     *   Mean of 3 events: plain mean of 3 (any DNF -> DNF)
     *   everything else:  Average of 5 (best and worst dropped, one DNF allowed)
     * @returns {number|null} seconds, Infinity (DNF), or null when there are not enough solves yet
     */
    function averageForEvent(values, eventId) {
        const required = requiredSolves(eventId);
        if (!Array.isArray(values) || values.length < required) return null;
        const last = values.slice(-required);
        return isMeanEvent(eventId) ? mean(last) : trimmedAverage(last, 1);
    }

    /** Every consecutive window of `size` results -> its average (same rules as averageForEvent). */
    function rollingAverages(values, eventId) {
        const size = requiredSolves(eventId);
        const out = [];
        for (let i = 0; i + size <= values.length; i++) out.push(averageForEvent(values.slice(i, i + size), eventId));
        return out;
    }

    /** Best (lowest finite) rolling average, or null when there is no finite window. */
    function bestRollingAverage(values, eventId) {
        let best = null;
        for (const avg of rollingAverages(values, eventId)) {
            if (avg !== null && Number.isFinite(avg) && (best === null || avg < best)) best = avg;
        }
        return best;
    }

    /** Index of the best (lowest finite) and worst (first DNF, else highest) value. */
    function bestWorstIndices(values) {
        let bestIdx = -1;
        let worstIdx = -1;
        let bestValue = Infinity;
        let worstValue = -Infinity;
        let sawDnf = false;
        values.forEach((value, idx) => {
            if (!Number.isFinite(value)) {
                if (!sawDnf) {
                    sawDnf = true;
                    worstIdx = idx;
                }
                return;
            }
            if (value < bestValue) {
                bestValue = value;
                bestIdx = idx;
            }
            if (!sawDnf && value > worstValue) {
                worstValue = value;
                worstIdx = idx;
            }
        });
        return { bestIdx, worstIdx };
    }

    // ── Statistics ────────────────────────────────────────────────────────

    // Abramowitz & Stegun 26.2.17 (|error| < 7.5e-8); one implementation for tools and backend.
    function normalCdf(x, mu = 0, sigma = 1) {
        if (!Number.isFinite(sigma) || sigma <= 0) return x > mu ? 1 : x < mu ? 0 : 0.5;
        const z = (x - mu) / sigma;
        const t = 1 / (1 + 0.2316419 * Math.abs(z));
        const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
        const upper = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * poly;
        return z >= 0 ? 1 - upper : upper;
    }

    // ── Data saved by the Average tool (localStorage 'ct_averages' / 'ct_incomplete_<event>') ──
    // Format owned by tools/average: averages = [[average, event, averageId, [[raw, penalty, ...], ...]], ...]
    // and incomplete = [[raw, penalty, ...], ...]. Other tools used to re-parse it by hand (or read a legacy
    // key that no longer exists).

    function solveSeconds(raw, penalty) {
        if (penalty === 'dnf') return DNF;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) return null; // unusable row
        return penalty === 'plus2' ? n + 2 : n;
    }

    function parseSolveList(list) {
        if (!Array.isArray(list)) return [];
        return list
            .map((entry) => (Array.isArray(entry) ? solveSeconds(entry[0], entry[1]) : null))
            .filter((v) => v !== null);
    }

    /** @returns {{average:string, event:string, averageId:string, solves:number[]}[]} oldest first; solves in seconds (DNF = Infinity) */
    function parseSavedAverages(json) {
        let data;
        try {
            data = typeof json === 'string' ? JSON.parse(json) : json;
        } catch {
            return [];
        }
        if (!Array.isArray(data)) return [];
        return data
            .filter((row) => Array.isArray(row) && row.length >= 4)
            .map(([average, event, averageId, solves]) => ({ average, event, averageId, solves: parseSolveList(solves) }));
    }

    function parseIncompleteSolves(json) {
        try {
            return parseSolveList(typeof json === 'string' ? JSON.parse(json) : json);
        } catch {
            return [];
        }
    }

    // ── Text helpers ──────────────────────────────────────────────────────

    const escapeHtml = (s) =>
        String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

    /** UTF-8 safe base64url. btoa() alone throws on anything outside Latin-1 (e.g. Chinese names). */
    function encodeBase64Url(text) {
        const bytes = new TextEncoder().encode(String(text));
        let bin = '';
        for (const b of bytes) bin += String.fromCharCode(b);
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function decodeBase64Url(encoded) {
        const b64 = String(encoded).replace(/-/g, '+').replace(/_/g, '/');
        const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
        return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    }

    return Object.freeze({
        DNF,
        MEAN_EVENTS,
        isMeanEvent,
        requiredSolves,
        isDnf,
        toCs,
        fromCs,
        parseTime,
        formatTime,
        formatCentiseconds,
        formatTimeInputValue,
        trimCount,
        mean,
        meanOfFinite,
        trimmedAverage,
        averageForEvent,
        rollingAverages,
        bestRollingAverage,
        bestWorstIndices,
        normalCdf,
        parseSavedAverages,
        parseIncompleteSolves,
        escapeHtml,
        encodeBase64Url,
        decodeBase64Url,
    });
});
