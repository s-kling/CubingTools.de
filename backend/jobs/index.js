/**
 * Jobs process (exactly one instance): everything periodic or heavy that must not run inside
 * request-serving workers and must not run twice.
 *   - WCA export download/import/publish (+ admin refresh/cancel requests)
 *   - upcoming-competition sync into live.db
 *   - newsletter fan-out, reminders and outbox dispatch
 */
import path from 'path';
import { loadConfig, parseArgs } from '../lib/config.js';
import { installFatalHandlers } from '../lib/logger.js';
import { acquireLock } from '../lib/lock.js';
import { closeMailer, getMailer } from '../lib/mailer.js';
import { WcaImporter } from '../wca/importer.js';
import { DEFAULT_EXPORT_DIR } from '../wca/store.js';
import { NewsletterOutbox } from '../newsletter/outbox.js';
import { FirestoreOutboxStore } from '../newsletter/store.js';
import { startNewsletterJobs } from '../newsletter/jobs.js';
import fs from 'fs';

const DAY = 24 * 60 * 60 * 1000;

export async function startJobs() {
    const args = parseArgs();
    const config = loadConfig();
    fs.mkdirSync(DEFAULT_EXPORT_DIR, { recursive: true });
    const release = acquireLock(path.join(DEFAULT_EXPORT_DIR, 'jobs.lock'));

    const importer = new WcaImporter({ dir: DEFAULT_EXPORT_DIR });
    const stops = [importer.startControlLoop()];

    // Competitions first (small), so the calendar works even while the big import runs.
    importer.syncCompetitions({ force: true }).catch(() => {});
    const compTimer = setInterval(() => importer.syncCompetitions().catch(() => {}), 60 * 60 * 1000);

    // First run: no data yet -> full import. Otherwise only check whether the WCA published a newer export.
    const refresh = () => importer.refresh({ force: !importer.pointer() }).catch((e) => console.error('[jobs] WCA refresh failed:', e.message));
    refresh();
    const refreshTimer = setInterval(refresh, DAY);

    let stopNewsletter = () => {};
    try {
        const { db } = await import('../firebase.js');
        const store = new FirestoreOutboxStore(db);
        const hostname = args.beta ? 'beta.cubingtools.de' : 'cubingtools.de';
        const outbox = new NewsletterOutbox({
            store,
            transport: getMailer({ maxConnections: config.newsletter.max_connections, ratePerSecond: config.newsletter.rate_per_second }),
            hostname,
            config: config.newsletter,
        });
        stopNewsletter = startNewsletterJobs({ db, store, outbox, config: config.newsletter });
    } catch (err) {
        console.error('[jobs] newsletter disabled (Firebase unavailable):', err.message);
    }

    installFatalHandlers('jobs', async () => {
        importer.cancel();
        clearInterval(compTimer);
        clearInterval(refreshTimer);
        stops.forEach((s) => s());
        stopNewsletter();
        closeMailer();
        release();
    });
    console.log(`[jobs] pid ${process.pid} running (export dir ${DEFAULT_EXPORT_DIR})`);
}

import { pathToFileURL } from 'url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startJobs().catch((e) => {
        console.error('[jobs] failed to start:', e.message);
        process.exit(1);
    });
}
