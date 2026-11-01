import axios from 'axios';

const WCA_API = 'https://www.worldcubeassociation.org/api/v0';
const COMP_LOOKAHEAD_DAYS = 365;

const MIN = 60 * 1000;
export const INTERVALS = {
    competitions: 60 * MIN, // detect newly announced competitions
    reminders: 10 * MIN, // registration-open reminders need minute-level precision
    dispatch: 5 * 1000, // drain the outbox
};

async function fetchAllCompetitions(http, start, end) {
    const comps = [];
    for (let page = 1; ; page++) {
        const { data } = await http.get(`${WCA_API}/competitions`, { params: { start, end, page }, timeout: 30_000 });
        if (!Array.isArray(data) || data.length === 0) break;
        comps.push(...data);
        if (data.length < 25) break; // WCA caps pages at 25
    }
    return comps;
}

/**
 * Job 1: find competitions we have not announced yet and fan them out into the outbox.
 * Safe to run on any schedule and from several processes: enqueueing is idempotent.
 */
export async function runCompetitionJob({ store, outbox, http = axios, log = console, seedOnFirstRun = true }) {
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + COMP_LOOKAHEAD_DAYS * 864e5).toISOString().slice(0, 10);
    const all = await fetchAllCompetitions(http, today, future);

    // First-ever run against an empty `newsletter_notified`: everything already announced on the
    // WCA site would look "new" and trigger a mass mailing. Record them instead.
    if (seedOnFirstRun && (await store.notifiedCount()) === 0 && all.length > 0) {
        log.warn(`[newsletter] empty notified-set: seeding ${all.length} existing competitions without sending`);
        for (const c of all) await store.markNotified(c.id, { country: c.country_iso2 || null, name: c.name, seeded: true });
        return { seeded: all.length, enqueued: 0 };
    }

    // One batched read instead of one sequential Firestore get per competition.
    const known = await store.isNotified(all.map((c) => c.id));
    const fresh = all.filter((c) => !known.has(c.id));
    let enqueued = 0;
    for (const comp of fresh) {
        try {
            enqueued += (await outbox.enqueueCompetition(comp)).enqueued;
            // Marked only after every subscriber is queued; a crash before this line re-runs the
            // (idempotent) enqueue instead of losing or duplicating mail.
            await store.markNotified(comp.id, { country: comp.country_iso2 || null, name: comp.name });
        } catch (err) {
            log.error(`[newsletter] enqueue failed for ${comp.id}:`, err.message);
        }
    }
    if (fresh.length) log.log(`[newsletter] ${fresh.length} new competition(s), ${enqueued} mail(s) queued`);
    return { competitions: fresh.length, enqueued };
}

/**
 * Job 2: registration reminders. Compares full timestamps (the old code compared calendar days, so
 * mails could go out up to a day before registration actually opened) and looks each competition up
 * once per run with bounded concurrency.
 */
export async function runReminderJob({ db, outbox, http = axios, log = console, now = () => Date.now() }) {
    const snap = await db.collection('newsletter_reminders').where('sent', '==', false).get();
    const byComp = new Map();
    for (const doc of snap.docs) {
        const d = doc.data();
        if (d.queued) continue;
        (byComp.get(d.competitionId) || byComp.set(d.competitionId, []).get(d.competitionId)).push({ id: doc.id, ...d });
    }
    let queued = 0;
    const entries = [...byComp.entries()];
    let next = 0;
    const worker = async () => {
        while (next < entries.length) {
            const [competitionId, reminders] = entries[next++];
            try {
                const { data: comp } = await http.get(`${WCA_API}/competitions/${competitionId}`, { timeout: 10_000 });
                const opensAt = comp.registration_open ? Date.parse(comp.registration_open) : NaN;
                if (!Number.isFinite(opensAt) || opensAt > now()) continue;
                const payload = {
                    name: comp.name,
                    city: comp.city || comp.venue_address || '',
                    date: comp.start_date === comp.end_date ? comp.start_date : `${comp.start_date} \u2013 ${comp.end_date}`,
                    registrationUrl: `https://www.worldcubeassociation.org/competitions/${competitionId}/register`,
                };
                for (const r of reminders) if (await outbox.enqueueReminder(r.id, r, payload)) queued++;
            } catch (err) {
                log.error(`[newsletter] reminder lookup failed for ${competitionId}:`, err.message);
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(4, entries.length) }, worker));
    return { queued };
}

/** Wire the three loops. Returns a stop() function. */
export function startNewsletterJobs({ db, store, outbox, http = axios, log = console, config }) {
    const timers = [];
    let busy = { competitions: false, reminders: false, dispatch: false };
    const guarded = (name, fn) => async () => {
        if (busy[name]) return; // never overlap runs of the same job
        busy[name] = true;
        try {
            await fn();
        } catch (err) {
            log.error(`[newsletter] ${name} job failed:`, err.message);
        } finally {
            busy[name] = false;
        }
    };

    const comp = guarded('competitions', () => runCompetitionJob({ store, outbox, http, log }));
    const rem = guarded('reminders', () => runReminderJob({ db, outbox, http, log }));
    const disp = guarded('dispatch', async () => {
        // Keep draining while full batches come back, then idle until the next tick.
        for (;;) {
            const s = await outbox.dispatchOnce();
            if (s.claimed) log.log(`[newsletter] dispatch ${JSON.stringify(s)}`);
            if (s.claimed < config.batch_size) break;
        }
    });

    timers.push(setTimeout(comp, 60_000), setTimeout(rem, 90_000));
    timers.push(setInterval(comp, INTERVALS.competitions), setInterval(rem, INTERVALS.reminders), setInterval(disp, INTERVALS.dispatch));
    timers.forEach((t) => t.unref?.());
    log.log('[newsletter] outbox jobs scheduled');
    return () => timers.forEach((t) => (clearTimeout(t), clearInterval(t)));
}
