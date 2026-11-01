import { escapeHtml, renderTemplate, stripHeaderChars } from '../lib/mailer.js';

const LOCK_MS = 5 * 60 * 1000;

export function backoffMs(attempt) {
    // 1m, 2m, 4m ... capped at 6h, with +-20% jitter so retries do not synchronise.
    const base = Math.min(60_000 * 2 ** (attempt - 1), 6 * 60 * 60 * 1000);
    return Math.round(base * (0.8 + Math.random() * 0.4));
}

// Recipient-specific rejections. Auth/connection errors (535, ECONNECTION ...) are NOT permanent:
// they are systemic and the item must survive until the problem is fixed.
const PERMANENT_SMTP = new Set([550, 551, 553, 554]);
const isPermanent = (err) => PERMANENT_SMTP.has(err?.responseCode);

/**
 * Durable newsletter delivery.
 *
 *   enqueueCompetition()  one outbox item per (competition, subscriber); the deterministic id
 *                         plus create-if-absent makes enqueueing idempotent, so a crash halfway
 *                         through simply resumes on the next run (no duplicates, no lost mails)
 *   dispatchOnce()        claims a batch, sends it with bounded concurrency over a pooled SMTP
 *                         transport, then marks each item sent / retry (backoff) / dead
 */
export class NewsletterOutbox {
    constructor({ store, transport, hostname, config, now = () => Date.now(), sender = process.env.EMAIL_USER }) {
        this.store = store;
        this.transport = transport;
        this.hostname = hostname;
        this.cfg = config;
        this.now = now;
        this.sender = sender;
    }

    static competitionItemId(competitionId, token) {
        return `comp_${competitionId}_${token}`;
    }

    async enqueueCompetition(comp) {
        const country = (comp.country_iso2 || '').toUpperCase();
        if (!country) return { enqueued: 0 };
        const payload = {
            competitionId: comp.id,
            name: comp.name,
            city: comp.city || comp.venue_address || comp.country_iso2 || '',
            date: comp.start_date === comp.end_date ? comp.start_date : `${comp.start_date} \u2013 ${comp.end_date}`,
            url: `https://www.worldcubeassociation.org/competitions/${comp.id}`,
        };
        let enqueued = 0;
        for await (const tokens of this.store.subscribersByCountry(country, 500)) {
            const entries = tokens.map((token) => [
                NewsletterOutbox.competitionItemId(comp.id, token),
                { kind: 'competition', subscriberToken: token, payload, attempts: 0, status: 'pending', nextAttemptAt: this.now(), createdAt: new Date(this.now()).toISOString() },
            ]);
            if (this.store.createManyIfAbsent) enqueued += await this.store.createManyIfAbsent(entries);
            else for (const [id, doc] of entries) if (await this.store.createIfAbsent(id, doc)) enqueued++;
        }
        return { enqueued };
    }

    async enqueueReminder(reminderId, reminder, payload) {
        const created = await this.store.createIfAbsent(`reminder_${reminderId}`, {
            kind: 'reminder',
            reminderId,
            subscriberToken: reminder.subscriberToken,
            email: reminder.email,
            reminderToken: reminder.token,
            payload,
            attempts: 0,
            status: 'pending',
            nextAttemptAt: this.now(),
            createdAt: new Date(this.now()).toISOString(),
        });
        await this.store.updateReminder(reminderId, { queued: true });
        return created;
    }

    _compose(item, sub) {
        const p = item.payload;
        const unsubscribe = `https://${this.hostname}/newsletter/unsubscribe?token=${item.subscriberToken}`;
        if (item.kind === 'competition') {
            const remind = `https://${this.hostname}/newsletter/remind?token=${item.subscriberToken}&competition=${encodeURIComponent(p.competitionId)}`;
            return {
                to: sub.email,
                subject: `New competition in your country: ${p.name}`,
                unsubscribe,
                html: renderTemplate('newsletter-competition', {
                    safeCompetitionName: escapeHtml(p.name),
                    safeCompetitionCity: escapeHtml(p.city),
                    safeCompetitionDate: escapeHtml(p.date),
                    safeCompetitionUrl: escapeHtml(p.url),
                    remindLink: remind,
                    unsubscribeLink: unsubscribe,
                }),
            };
        }
        return {
            to: item.email,
            subject: `Registration is now open: ${p.name}`,
            unsubscribe,
            html: renderTemplate('newsletter-reminder', {
                safeCompetitionName: escapeHtml(p.name),
                safeCompetitionCity: escapeHtml(p.city),
                safeCompetitionDate: escapeHtml(p.date),
                safeRegistrationUrl: escapeHtml(p.registrationUrl),
                cancelReminderLink: `https://${this.hostname}/newsletter/remind/cancel?token=${item.reminderToken}`,
                unsubscribeLink: unsubscribe,
            }),
        };
    }

    async _deliver(item, sub) {
        const mail = this._compose(item, sub);
        await this.transport.sendMail({
            from: `CubingTools.de <${this.sender}>`,
            to: stripHeaderChars(mail.to),
            subject: mail.subject,
            html: mail.html,
            headers: { 'List-Unsubscribe': `<${mail.unsubscribe}>` },
        });
    }

    /** @returns {Promise<{claimed:number,sent:number,retried:number,dead:number,skipped:number}>} */
    async dispatchOnce() {
        const { batch_size, max_attempts, max_connections } = this.cfg;
        const items = await this.store.claimDue(this.now(), batch_size, LOCK_MS);
        const stats = { claimed: items.length, sent: 0, retried: 0, dead: 0, skipped: 0 };
        if (!items.length) return stats;

        // One round trip for all subscriber docs of the batch (was: one read per email).
        const subs = await this.store.getSubscribers([...new Set(items.filter((i) => i.kind === 'competition').map((i) => i.subscriberToken))]);

        let next = 0;
        const worker = async () => {
            while (next < items.length) {
                const item = items[next++];
                const sub = subs.get(item.subscriberToken);
                try {
                    if (item.kind === 'competition' && (!sub || !sub.confirmed)) {
                        // Unsubscribed (or never confirmed) since enqueueing: drop silently.
                        await this.store.update(item.id, { status: 'skipped', nextAttemptAt: undefined });
                        stats.skipped++;
                        continue;
                    }
                    await this._deliver(item, sub);
                    await this.store.update(item.id, { status: 'sent', sentAt: new Date(this.now()).toISOString(), nextAttemptAt: undefined, lastError: undefined });
                    if (item.kind === 'reminder') await this.store.updateReminder(item.reminderId, { sent: true, sentAt: new Date(this.now()).toISOString() });
                    stats.sent++;
                } catch (err) {
                    const attempts = (item.attempts || 0) + 1;
                    if (attempts >= max_attempts || isPermanent(err)) {
                        await this.store.update(item.id, { status: 'dead', attempts, lastError: String(err.message).slice(0, 300), nextAttemptAt: undefined });
                        stats.dead++;
                    } else {
                        await this.store.update(item.id, { status: 'pending', attempts, lastError: String(err.message).slice(0, 300), nextAttemptAt: this.now() + backoffMs(attempts) });
                        stats.retried++;
                    }
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(max_connections, items.length) }, worker));
        return stats;
    }
}
