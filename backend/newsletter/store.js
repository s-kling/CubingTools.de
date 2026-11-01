/**
 * Storage backends for the newsletter outbox.
 *
 * Queue semantics ("visibility timeout", as in SQS): an item is eligible when it has a
 * `nextAttemptAt <= now`. Claiming bumps `nextAttemptAt` into the future inside a transaction,
 * so concurrent dispatchers (several jobs processes, a restart mid-batch) never send the same
 * item twice, and a crashed dispatcher's items simply become eligible again once the lock
 * expires. Items that are finished lose the field entirely, which keeps this query on a
 * single-field index (no composite index needed).
 */

export class MemoryOutboxStore {
    constructor() {
        this.items = new Map();
        this.subscribers = new Map(); // token -> {email, country, confirmed}
        this.notified = new Set();
        this.reminders = new Map();
    }
    addSubscriber(token, data) {
        this.subscribers.set(token, { token, ...data });
    }
    async createIfAbsent(id, doc) {
        if (this.items.has(id)) return false;
        this.items.set(id, { ...doc });
        return true;
    }
    async claimDue(now, limit, lockMs) {
        const due = [...this.items.entries()]
            .filter(([, d]) => d.nextAttemptAt != null && d.nextAttemptAt <= now)
            .sort((a, b) => a[1].nextAttemptAt - b[1].nextAttemptAt)
            .slice(0, limit);
        return due.map(([id, d]) => {
            d.nextAttemptAt = now + lockMs;
            d.status = 'sending';
            return { id, ...structuredClone(d) };
        });
    }
    async update(id, patch) {
        const d = this.items.get(id);
        if (!d) return;
        for (const [k, v] of Object.entries(patch)) (v === undefined ? delete d[k] : (d[k] = v));
    }
    async getSubscribers(tokens) {
        return new Map(tokens.map((t) => [t, this.subscribers.get(t) || null]));
    }
    async *subscribersByCountry(country, pageSize = 500) {
        const all = [...this.subscribers.values()].filter((s) => s.country === country && s.confirmed);
        for (let i = 0; i < all.length; i += pageSize) yield all.slice(i, i + pageSize).map((s) => s.token);
    }
    async isNotified(ids) {
        return new Set(ids.filter((i) => this.notified.has(i)));
    }
    async markNotified(id) {
        this.notified.add(id);
    }
    async notifiedCount() {
        return this.notified.size;
    }
    async updateReminder(id, patch) {
        Object.assign(this.reminders.get(id) || {}, patch);
    }
}

export class FirestoreOutboxStore {
    constructor(db, { collection = 'newsletter_outbox' } = {}) {
        this.db = db;
        this.col = db.collection(collection);
    }

    async createIfAbsent(id, doc) {
        try {
            await this.col.doc(id).create(doc);
            return true;
        } catch (err) {
            if (err.code === 6 || /ALREADY_EXISTS/.test(String(err.message))) return false;
            throw err;
        }
    }

    /** Bulk variant used when enqueueing thousands of subscribers; BulkWriter handles throttling/retries. */
    async createManyIfAbsent(entries) {
        const writer = this.db.bulkWriter();
        let created = 0;
        const pending = entries.map(([id, doc]) =>
            writer.create(this.col.doc(id), doc).then(
                () => void created++,
                (err) => {
                    if (!(err.code === 6 || /ALREADY_EXISTS/.test(String(err.message)))) throw err;
                },
            ),
        );
        await writer.close();
        await Promise.all(pending);
        return created;
    }

    async claimDue(now, limit, lockMs) {
        const snap = await this.col.where('nextAttemptAt', '<=', now).orderBy('nextAttemptAt').limit(limit).get();
        const claimed = [];
        await Promise.all(
            snap.docs.map((doc) =>
                this.db.runTransaction(async (tx) => {
                    const fresh = await tx.get(doc.ref);
                    const d = fresh.data();
                    if (!d || d.nextAttemptAt == null || d.nextAttemptAt > now) return; // lost the race
                    tx.update(doc.ref, { nextAttemptAt: now + lockMs, status: 'sending' });
                    claimed.push({ id: doc.id, ...d, status: 'sending', nextAttemptAt: now + lockMs });
                }),
            ),
        );
        return claimed;
    }

    async update(id, patch) {
        const { FieldValue } = await import('firebase-admin/firestore');
        const out = {};
        for (const [k, v] of Object.entries(patch)) out[k] = v === undefined ? FieldValue.delete() : v;
        await this.col.doc(id).update(out);
    }

    async getSubscribers(tokens) {
        const refs = tokens.map((t) => this.db.collection('newsletter_subscribers').doc(t));
        const out = new Map();
        for (let i = 0; i < refs.length; i += 300) {
            const docs = await this.db.getAll(...refs.slice(i, i + 300));
            docs.forEach((d, j) => out.set(tokens[i + j], d.exists ? d.data() : null));
        }
        return out;
    }

    async *subscribersByCountry(country, pageSize = 500) {
        let last = null;
        for (;;) {
            let q = this.db
                .collection('newsletter_subscribers')
                .where('country', '==', country)
                .where('confirmed', '==', true)
                .orderBy('__name__')
                .select()
                .limit(pageSize);
            if (last) q = q.startAfter(last);
            const snap = await q.get();
            if (snap.empty) return;
            last = snap.docs[snap.docs.length - 1];
            yield snap.docs.map((d) => d.id);
            if (snap.size < pageSize) return;
        }
    }

    async isNotified(ids) {
        const refs = ids.map((i) => this.db.collection('newsletter_notified').doc(i));
        const seen = new Set();
        for (let i = 0; i < refs.length; i += 300) {
            const docs = await this.db.getAll(...refs.slice(i, i + 300), { fieldMask: [] });
            docs.forEach((d) => d.exists && seen.add(d.id));
        }
        return seen;
    }

    async markNotified(id, data = {}) {
        await this.db.collection('newsletter_notified').doc(id).set({ notifiedAt: new Date().toISOString(), ...data });
    }

    async notifiedCount() {
        const snap = await this.db.collection('newsletter_notified').limit(1).get();
        return snap.size;
    }

    async updateReminder(id, patch) {
        await this.db.collection('newsletter_reminders').doc(id).update(patch);
    }
}
