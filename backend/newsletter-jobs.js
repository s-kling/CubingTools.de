/**
 * newsletter-jobs.js
 *
 * Background jobs that drive the competition newsletter feature:
 *
 *   Job 1 – Competition notifications (every hour)
 *     Fetches upcoming competitions from the WCA API, compares them against
 *     the `newsletter_notified` Firestore collection, and sends competition
 *     announcement emails to confirmed subscribers in the matching country.
 *
 *   Job 2 – Registration reminders (every 6 hours)
 *     Reads all unsent entries from `newsletter_reminders`, fetches each
 *     competition from the WCA API to check whether registration has opened,
 *     and dispatches the reminder email when it has.
 */

import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const WCA_API = 'https://www.worldcubeassociation.org/api/v0';

/** Number of days ahead to look for new competitions. */
const COMP_LOOKAHEAD_DAYS = 365;

/** Delay before the first run so the server can finish booting. */
const INITIAL_DELAY_MS = 60_000;

/** How often to re-check for new competitions (ms). */
const COMPETITION_JOB_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day

/** How often to check pending registration reminders (ms). */
const REMINDER_JOB_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start both newsletter background jobs.
 * Call once from server.js after all services are ready.
 *
 * @param {import('firebase-admin').firestore.Firestore} db
 * @param {import('./API/API/newsletter.api.js').default} newsletterApi
 * @param {string} hostname  - 'cubingtools.de' | 'beta.cubingtools.de'
 */
export function startNewsletterJobs(db, newsletterApi, hostname = 'cubingtools.de') {
    // Delay the first run so the server can finish booting.
    setTimeout(() => {
        runCompetitionNotificationJob(db, newsletterApi, hostname).catch((err) =>
            console.error('[newsletter] Competition notification job error:', err.message),
        );

        runRegistrationReminderJob(db, newsletterApi, hostname).catch((err) =>
            console.error('[newsletter] Registration reminder job error:', err.message),
        );
    }, INITIAL_DELAY_MS);

    setInterval(() => {
        runCompetitionNotificationJob(db, newsletterApi, hostname).catch((err) =>
            console.error('[newsletter] Competition notification job error:', err.message),
        );
    }, COMPETITION_JOB_INTERVAL_MS);

    setInterval(() => {
        runRegistrationReminderJob(db, newsletterApi, hostname).catch((err) =>
            console.error('[newsletter] Registration reminder job error:', err.message),
        );
    }, REMINDER_JOB_INTERVAL_MS);

    console.log('[newsletter] Background jobs scheduled.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Job 1 – Competition announcements
// ─────────────────────────────────────────────────────────────────────────────

async function runCompetitionNotificationJob(db, newsletterApi, hostname) {
    console.log('[newsletter] Running competition notification job...');

    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + COMP_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

    // Fetch all upcoming competitions from the WCA network API.
    const allComps = await fetchWcaCompetitions(today, future);
    console.log(`[newsletter] Fetched ${allComps.length} upcoming competitions from WCA.`);

    // Identify competitions that have not been notified yet.
    const newComps = [];
    for (const comp of allComps) {
        const doc = await db.collection('newsletter_notified').doc(comp.id).get();
        if (!doc.exists) {
            newComps.push(comp);
        }
    }

    if (newComps.length === 0) {
        console.log('[newsletter] No new competitions to notify.');
        return;
    }

    console.log(`[newsletter] ${newComps.length} new competition(s) to notify.`);

    for (const comp of newComps) {
        try {
            await notifySubscribersForCompetition(db, newsletterApi, comp, hostname);

            // Record that this competition has been notified so we never re-send.
            await db
                .collection('newsletter_notified')
                .doc(comp.id)
                .set({
                    notifiedAt: new Date().toISOString(),
                    country: comp.country_iso2 || null,
                    name: comp.name,
                });
        } catch (err) {
            console.error(`[newsletter] Failed to notify for competition ${comp.id}:`, err.message);
        }
    }
}

/**
 * Fetch all upcoming WCA competitions between `start` and `end` (YYYY-MM-DD).
 * Handles WCA API pagination automatically.
 */
async function fetchWcaCompetitions(start, end) {
    const comps = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const params = new URLSearchParams({ start, end, page });
        const { data } = await axios.get(`${WCA_API}/competitions?${params}`, {
            timeout: 30_000,
        });

        if (!Array.isArray(data) || data.length === 0) {
            hasMore = false;
        } else {
            comps.push(...data);
            hasMore = data.length === 25; // WCA API caps at 25 per page
            page++;
        }
    }

    return comps;
}

async function notifySubscribersForCompetition(db, newsletterApi, comp, hostname) {
    const country = (comp.country_iso2 || '').toUpperCase();
    if (!country) return;

    const subscribersSnap = await db
        .collection('newsletter_subscribers')
        .where('country', '==', country)
        .where('confirmed', '==', true)
        .get();

    if (subscribersSnap.empty) return;

    const startDate = comp.start_date;
    const endDate = comp.end_date;
    const dateLabel = startDate === endDate ? startDate : `${startDate} \u2013 ${endDate}`;
    const city = comp.city || comp.venue_address || comp.country_iso2 || '';
    const competitionUrl = `https://www.worldcubeassociation.org/competitions/${comp.id}`;

    console.log(
        `[newsletter] Sending competition email for "${comp.name}" (${comp.id}) to ${subscribersSnap.size} subscriber(s).`,
    );

    for (const doc of subscribersSnap.docs) {
        const { token: subscriberToken } = doc.data();
        try {
            await newsletterApi.sendCompetitionEmail({
                subscriberToken,
                competitionId: comp.id,
                competitionName: comp.name,
                competitionCity: city,
                competitionDate: dateLabel,
                competitionUrl,
                hostname,
            });
        } catch (err) {
            console.error(
                `[newsletter] Failed to send competition email to subscriber ${doc.id}:`,
                err.message,
            );
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Job 2 – Registration reminders
// ─────────────────────────────────────────────────────────────────────────────

async function runRegistrationReminderJob(db, newsletterApi, hostname) {
    console.log('[newsletter] Running registration reminder job...');

    const pendingSnap = await db
        .collection('newsletter_reminders')
        .where('sent', '==', false)
        .get();

    if (pendingSnap.empty) {
        console.log('[newsletter] No pending registration reminders.');
        return;
    }

    // Group reminder docs by competition ID to minimise WCA API calls.
    const byCompetition = new Map();
    for (const doc of pendingSnap.docs) {
        const { competitionId } = doc.data();
        if (!byCompetition.has(competitionId)) {
            byCompetition.set(competitionId, []);
        }
        byCompetition.get(competitionId).push(doc);
    }

    const today = new Date().toISOString().slice(0, 10);

    for (const [competitionId, docs] of byCompetition.entries()) {
        try {
            const comp = await fetchWcaCompetitionDetails(competitionId);

            // `registration_open` is an ISO datetime, e.g. "2026-08-01T12:00:00.000Z".
            const registrationOpenDate = comp.registration_open
                ? comp.registration_open.slice(0, 10)
                : null;

            if (!registrationOpenDate || registrationOpenDate > today) {
                // Registration has not opened yet.
                continue;
            }

            const startDate = comp.start_date;
            const endDate = comp.end_date;
            const dateLabel = startDate === endDate ? startDate : `${startDate} \u2013 ${endDate}`;
            const city = comp.city || comp.venue_address || '';
            const registrationUrl = `https://www.worldcubeassociation.org/competitions/${competitionId}/register`;

            console.log(
                `[newsletter] Registration open for ${competitionId} — sending ${docs.length} reminder(s).`,
            );

            for (const doc of docs) {
                try {
                    await newsletterApi.sendReminderEmail(
                        doc.id,
                        {
                            name: comp.name,
                            city,
                            date: dateLabel,
                            registrationUrl,
                        },
                        hostname,
                    );
                } catch (err) {
                    console.error(`[newsletter] Failed to send reminder ${doc.id}:`, err.message);
                }
            }
        } catch (err) {
            console.error(
                `[newsletter] Failed to process reminders for competition ${competitionId}:`,
                err.message,
            );
        }
    }
}

async function fetchWcaCompetitionDetails(competitionId) {
    const { data } = await axios.get(`${WCA_API}/competitions/${competitionId}`, {
        timeout: 10_000,
    });
    return data;
}
