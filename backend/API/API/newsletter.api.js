import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// RFC-5321-aware email format check.
function isValidEmail(email) {
    return (
        typeof email === 'string' &&
        email.length <= 320 &&
        /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
            email,
        )
    );
}

// WCA ISO 3166-1 alpha-2 country codes (excludes "Multiple Countries" pseudo-codes).
const VALID_COUNTRY_CODES = new Set([
    'AF',
    'AL',
    'DZ',
    'AD',
    'AO',
    'AG',
    'AR',
    'AM',
    'AU',
    'AT',
    'AZ',
    'BS',
    'BH',
    'BD',
    'BB',
    'BY',
    'BE',
    'BZ',
    'BJ',
    'BT',
    'BO',
    'BA',
    'BW',
    'BR',
    'BN',
    'BG',
    'BF',
    'BI',
    'CV',
    'KH',
    'CM',
    'CA',
    'CF',
    'TD',
    'CL',
    'CN',
    'TW',
    'CO',
    'KM',
    'CG',
    'CR',
    'HR',
    'CU',
    'CY',
    'CZ',
    'CI',
    'KP',
    'CD',
    'DK',
    'DJ',
    'DM',
    'DO',
    'EC',
    'EG',
    'SV',
    'GQ',
    'ER',
    'EE',
    'SZ',
    'ET',
    'FM',
    'FJ',
    'FI',
    'FR',
    'GA',
    'GM',
    'GE',
    'DE',
    'GH',
    'GR',
    'GD',
    'GT',
    'GW',
    'GN',
    'GY',
    'HT',
    'HN',
    'HK',
    'HU',
    'IS',
    'IN',
    'ID',
    'IR',
    'IQ',
    'IE',
    'IL',
    'IT',
    'JM',
    'JP',
    'JO',
    'KZ',
    'KE',
    'KI',
    'XK',
    'KW',
    'KG',
    'LA',
    'LV',
    'LB',
    'LS',
    'LR',
    'LY',
    'LI',
    'LT',
    'LU',
    'MO',
    'MG',
    'MW',
    'MY',
    'MV',
    'ML',
    'MT',
    'MH',
    'MR',
    'MU',
    'MX',
    'MD',
    'MC',
    'MN',
    'ME',
    'MA',
    'MZ',
    'MM',
    'NA',
    'NR',
    'NP',
    'NL',
    'NZ',
    'NI',
    'NE',
    'NG',
    'MK',
    'NO',
    'OM',
    'PK',
    'PW',
    'PS',
    'PA',
    'PG',
    'PY',
    'PE',
    'PH',
    'PL',
    'PT',
    'QA',
    'KR',
    'RO',
    'RU',
    'RW',
    'KN',
    'LC',
    'VC',
    'WS',
    'SM',
    'ST',
    'SA',
    'SN',
    'RS',
    'SC',
    'SL',
    'SG',
    'SK',
    'SI',
    'SB',
    'SO',
    'ZA',
    'SS',
    'ES',
    'LK',
    'SD',
    'SR',
    'SE',
    'CH',
    'SY',
    'TJ',
    'TZ',
    'TH',
    'TL',
    'TG',
    'TO',
    'TT',
    'TN',
    'TR',
    'TM',
    'TV',
    'UG',
    'UA',
    'AE',
    'GB',
    'US',
    'UY',
    'UZ',
    'VA',
    'VU',
    'VE',
    'VN',
    'YE',
    'ZM',
    'ZW',
]);

export default class NewsletterApi {
    constructor(_db) {
        this.db = _db;
    }

    normalizeEmail(email) {
        return String(email || '')
            .trim()
            .toLowerCase();
    }

    createTransporter() {
        return nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD,
            },
        });
    }

    escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    getHostname(requestHost) {
        const host = String(requestHost || '');
        return host.includes(':8001') || host.includes('beta.cubingtools.de')
            ? 'beta.cubingtools.de'
            : 'cubingtools.de';
    }

    // POST /api/newsletter/subscribe
    async handleSubscribe(req, res) {
        const { email, country } = req.body || {};

        if (!email || !country) {
            return res.status(400).json({ success: false, error: 'Missing required fields.' });
        }

        const normalizedEmail = this.normalizeEmail(email);

        if (!isValidEmail(normalizedEmail)) {
            return res.status(400).json({ success: false, error: 'Invalid email address.' });
        }

        const normalizedCountry = String(country || '')
            .trim()
            .toUpperCase();
        if (!VALID_COUNTRY_CODES.has(normalizedCountry)) {
            return res.status(400).json({ success: false, error: 'Invalid country code.' });
        }

        try {
            // If already confirmed, reject to prevent re-subscription fishing.
            const existing = await this.db
                .collection('newsletter_subscribers')
                .where('email', '==', normalizedEmail)
                .limit(1)
                .get();

            if (!existing.empty && existing.docs[0].data().confirmed) {
                // Return 200 so the user cannot enumerate subscribed addresses.
                return res.json({ success: true });
            }

            // Remove any stale unconfirmed doc for this email before creating a fresh one.
            if (!existing.empty) {
                await existing.docs[0].ref.delete();
            }

            const token = crypto.randomBytes(32).toString('hex');
            const hostname = this.getHostname(req.get('host'));

            await this.db.collection('newsletter_subscribers').doc(token).set({
                email: normalizedEmail,
                country: normalizedCountry,
                confirmed: false,
                token,
                subscribedAt: new Date().toISOString(),
            });

            await this.sendSubscriptionConfirmEmail({
                email: normalizedEmail,
                country: normalizedCountry,
                token,
                hostname,
            });

            return res.json({ success: true });
        } catch (err) {
            console.error('Newsletter subscribe error:', err);
            return res
                .status(500)
                .json({ success: false, error: 'Subscription failed. Please try again.' });
        }
    }

    // GET /newsletter/confirm?token=...  (called by routes.js)
    async handleConfirm(req, res) {
        const { token } = req.query;

        if (!token || typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
            return res.redirect(302, '/?newsletter=invalid');
        }

        try {
            const doc = await this.db.collection('newsletter_subscribers').doc(token).get();

            if (!doc.exists) {
                return res.redirect(302, '/?newsletter=invalid');
            }

            if (doc.data().confirmed) {
                return res.redirect(302, '/?newsletter=already-confirmed');
            }

            await doc.ref.update({ confirmed: true });
            return res.redirect(302, '/?newsletter=confirmed');
        } catch (err) {
            console.error('Newsletter confirm error:', err);
            return res.redirect(302, '/?newsletter=error');
        }
    }

    // GET /newsletter/unsubscribe?token=...  (called by routes.js)
    async handleUnsubscribe(req, res) {
        const { token } = req.query;

        if (!token || typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
            return res.redirect(302, '/?newsletter=invalid');
        }

        try {
            const doc = await this.db.collection('newsletter_subscribers').doc(token).get();

            if (!doc.exists) {
                return res.redirect(302, '/?newsletter=not-found');
            }

            // Also delete any pending reminders for this subscriber.
            const reminderSnap = await this.db
                .collection('newsletter_reminders')
                .where('subscriberToken', '==', token)
                .get();

            const batch = this.db.batch();
            reminderSnap.docs.forEach((d) => batch.delete(d.ref));
            batch.delete(doc.ref);
            await batch.commit();

            return res.redirect(302, '/?newsletter=unsubscribed');
        } catch (err) {
            console.error('Newsletter unsubscribe error:', err);
            return res.redirect(302, '/?newsletter=error');
        }
    }

    // GET /newsletter/remind?token=...&competition=...  (called by routes.js)
    async handleSetReminder(req, res) {
        const { token, competition } = req.query;

        if (!token || typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
            return res.redirect(302, '/?reminder=invalid');
        }

        if (
            !competition ||
            typeof competition !== 'string' ||
            !/^[A-Za-z0-9_-]{1,64}$/.test(competition)
        ) {
            return res.redirect(302, '/?reminder=invalid');
        }

        try {
            const doc = await this.db.collection('newsletter_subscribers').doc(token).get();

            if (!doc.exists || !doc.data().confirmed) {
                return res.redirect(302, '/?reminder=invalid');
            }

            const { email } = doc.data();

            // Avoid duplicate reminders for the same competition.
            const existing = await this.db
                .collection('newsletter_reminders')
                .where('subscriberToken', '==', token)
                .where('competitionId', '==', competition)
                .limit(1)
                .get();

            if (!existing.empty) {
                return res.redirect(302, '/?reminder=already-set');
            }

            const reminderId = crypto.randomBytes(16).toString('hex');
            const reminderToken = crypto.randomBytes(32).toString('hex');

            await this.db.collection('newsletter_reminders').doc(reminderId).set({
                subscriberToken: token,
                email,
                competitionId: competition,
                sent: false,
                createdAt: new Date().toISOString(),
                token: reminderToken,
            });

            return res.redirect(302, '/?reminder=set');
        } catch (err) {
            console.error('Newsletter set reminder error:', err);
            return res.redirect(302, '/?reminder=error');
        }
    }

    // GET /newsletter/remind/cancel?token=...  (called by routes.js)
    async handleCancelReminder(req, res) {
        const { token } = req.query;

        if (!token || typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
            return res.redirect(302, '/?reminder=invalid');
        }

        try {
            const snapshot = await this.db
                .collection('newsletter_reminders')
                .where('token', '==', token)
                .limit(1)
                .get();

            if (snapshot.empty) {
                return res.redirect(302, '/?reminder=not-found');
            }

            await snapshot.docs[0].ref.delete();
            return res.redirect(302, '/?reminder=cancelled');
        } catch (err) {
            console.error('Newsletter cancel reminder error:', err);
            return res.redirect(302, '/?reminder=error');
        }
    }

    // Send double opt-in confirmation email after subscription.
    async sendSubscriptionConfirmEmail({ email, country, token, hostname }) {
        const transporter = this.createTransporter();
        const confirmLink = `https://${hostname}/newsletter/confirm?token=${token}`;
        const unsubscribeLink = `https://${hostname}/newsletter/unsubscribe?token=${token}`;

        const safeEmail = this.escapeHtml(email);
        const safeCountry = this.escapeHtml(country);

        const templatePath = path.join(__dirname, '..', 'mail', 'newsletter-confirm.html');
        const html = fs
            .readFileSync(templatePath, 'utf8')
            .replace(/\$\{safeEmail\}/g, safeEmail)
            .replace(/\$\{safeCountry\}/g, safeCountry)
            .replace(/\$\{confirmLink\}/g, confirmLink)
            .replace(/\$\{unsubscribeLink\}/g, unsubscribeLink);

        const headerEmail = email.replace(/[\r\n\0]/g, '');

        await transporter.sendMail({
            from: `CubingTools.de <${process.env.EMAIL_USER}>`,
            to: headerEmail,
            subject: 'Confirm your competition newsletter subscription – CubingTools.de',
            html,
        });
    }

    /**
     * Send a competition announcement email to a confirmed subscriber.
     * Intended to be called by a background job or admin trigger.
     *
     * @param {object} params
     * @param {string} params.subscriberToken  - The subscriber's token (doc ID).
     * @param {string} params.competitionId    - WCA competition ID.
     * @param {string} params.competitionName  - Human-readable competition name.
     * @param {string} params.competitionCity  - City / venue.
     * @param {string} params.competitionDate  - Formatted date range string.
     * @param {string} params.competitionUrl   - Full WCA URL.
     * @param {string} params.hostname         - cubingtools.de or beta.cubingtools.de.
     */
    async sendCompetitionEmail({
        subscriberToken,
        competitionId,
        competitionName,
        competitionCity,
        competitionDate,
        competitionUrl,
        hostname,
    }) {
        const doc = await this.db.collection('newsletter_subscribers').doc(subscriberToken).get();
        if (!doc.exists || !doc.data().confirmed) {
            return;
        }

        const { email } = doc.data();
        const transporter = this.createTransporter();

        const remindLink = `https://${hostname}/newsletter/remind?token=${subscriberToken}&competition=${encodeURIComponent(competitionId)}`;
        const unsubscribeLink = `https://${hostname}/newsletter/unsubscribe?token=${subscriberToken}`;

        const safeCompetitionName = this.escapeHtml(competitionName);
        const safeCompetitionCity = this.escapeHtml(competitionCity);
        const safeCompetitionDate = this.escapeHtml(competitionDate);
        const safeCompetitionUrl = this.escapeHtml(competitionUrl);

        const templatePath = path.join(__dirname, '..', 'mail', 'newsletter-competition.html');
        const html = fs
            .readFileSync(templatePath, 'utf8')
            .replace(/\$\{safeCompetitionName\}/g, safeCompetitionName)
            .replace(/\$\{safeCompetitionCity\}/g, safeCompetitionCity)
            .replace(/\$\{safeCompetitionDate\}/g, safeCompetitionDate)
            .replace(/\$\{safeCompetitionUrl\}/g, safeCompetitionUrl)
            .replace(/\$\{remindLink\}/g, remindLink)
            .replace(/\$\{unsubscribeLink\}/g, unsubscribeLink);

        const headerEmail = email.replace(/[\r\n\0]/g, '');

        await transporter.sendMail({
            from: `CubingTools.de <${process.env.EMAIL_USER}>`,
            to: headerEmail,
            subject: `New competition in your country: ${competitionName}`,
            html,
        });
    }

    /**
     * Send a registration-opens reminder email for a specific reminder doc.
     * Intended to be called by a background job once registration opens.
     *
     * @param {string} reminderId - The reminder document ID.
     * @param {object} competitionDetails - { name, city, date, registrationUrl }
     * @param {string} hostname
     */
    async sendReminderEmail(reminderId, { name, city, date, registrationUrl }, hostname) {
        const doc = await this.db.collection('newsletter_reminders').doc(reminderId).get();
        if (!doc.exists || doc.data().sent) {
            return;
        }

        const { email, token: reminderToken, subscriberToken } = doc.data();
        const transporter = this.createTransporter();

        const cancelReminderLink = `https://${hostname}/newsletter/remind/cancel?token=${reminderToken}`;
        const unsubscribeLink = `https://${hostname}/newsletter/unsubscribe?token=${subscriberToken}`;

        const safeName = this.escapeHtml(name);
        const safeCity = this.escapeHtml(city);
        const safeDate = this.escapeHtml(date);
        const safeRegistrationUrl = this.escapeHtml(registrationUrl);

        const templatePath = path.join(__dirname, '..', 'mail', 'newsletter-reminder.html');
        const html = fs
            .readFileSync(templatePath, 'utf8')
            .replace(/\$\{safeCompetitionName\}/g, safeName)
            .replace(/\$\{safeCompetitionCity\}/g, safeCity)
            .replace(/\$\{safeCompetitionDate\}/g, safeDate)
            .replace(/\$\{safeRegistrationUrl\}/g, safeRegistrationUrl)
            .replace(/\$\{cancelReminderLink\}/g, cancelReminderLink)
            .replace(/\$\{unsubscribeLink\}/g, unsubscribeLink);

        const headerEmail = email.replace(/[\r\n\0]/g, '');

        await transporter.sendMail({
            from: `CubingTools.de <${process.env.EMAIL_USER}>`,
            to: headerEmail,
            subject: `Registration is now open: ${name}`,
            html,
        });

        await doc.ref.update({ sent: true, sentAt: new Date().toISOString() });
    }
}
