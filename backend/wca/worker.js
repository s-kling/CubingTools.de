import { parentPort, workerData } from 'worker_threads';
import { WcaStore } from './store.js';
import { buildPerformanceProfile, computeRoundRankings } from './stats.js';

// Each worker thread owns a read-only handle to the same published export; SQLite handles
// concurrent readers across threads and processes without locking.
const store = new WcaStore({ dir: workerData?.dir });

const tasks = {
    /**
     * Build a historical performance profile (recent competition averages) for many people in
     * one go. Runs the SQL here so the logic worker's event loop stays free.
     */
    profiles({ wcaIds, eventId, limit = 12 }) {
        return wcaIds.map((wcaId) => {
            try {
                if (!store.getPerson(wcaId)) return { wcaId, profile: null, error: `WCA ID not found in export: ${wcaId}` };
                const recentNewestFirst = store.getEventResults(wcaId, eventId, { limit });
                return { wcaId, profile: buildPerformanceProfile(recentNewestFirst.reverse()) };
            } catch (err) {
                return { wcaId, profile: null, error: err.message };
            }
        });
    },

    /** Monte-Carlo ranking; `profiles` is an array of [wcaId, {name, countryIso2, profile}]. */
    rankings({ profiles, sims }) {
        return computeRoundRankings(new Map(profiles), { sims });
    },
};

parentPort.on('message', ({ id, task, payload }) => {
    try {
        const fn = tasks[task];
        if (!fn) throw new Error(`unknown task ${task}`);
        parentPort.postMessage({ id, result: fn(payload) });
    } catch (err) {
        parentPort.postMessage({ id, error: err.message, stack: err.stack });
    }
});
