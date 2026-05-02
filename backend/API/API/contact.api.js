import fs from 'fs';
import path from 'path';

import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { RecaptchaEnterpriseServiceClient } from '@google-cloud/recaptcha-enterprise';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class ContactApi {
    constructor(_db) {
        this.password = process.env.CONTACT_API_PASSWORD || '';
        this.projectID = process.env.RECAPTCHA_PROJECT_ID || '';
        this.recaptchaKey = process.env.RECAPTCHA_SITE_KEY || '';
        this.recaptchaAction = process.env.RECAPTCHA_ACTION || '';
        this.bansPath = path.join(__dirname, '..', 'mail', 'bans.json');
        this.unconfirmedTtlMs = 60 * 60 * 1000;
        this.db = _db;
    }

    // Accept boolean-like frontend flags.
    parseBooleanFlag(value) {
        if (typeof value === 'boolean') {
            return value;
        }

        const normalized = String(value || '')
            .trim()
            .toLowerCase();

        return ['1', 'true', 'yes', 'on'].includes(normalized);
    }

    // Normalize emails for stable comparisons and storage.
    normalizeEmail(email) {
        return String(email || '')
            .trim()
            .toLowerCase();
    }

    // Normalize values based on ban type.
    normalizeBanValue(type, value) {
        if (type === 'email') {
            return this.normalizeEmail(value);
        }

        if (type === 'ip') {
            return String(value || '')
                .trim()
                .toLowerCase();
        }

        return '';
    }

    // Read bans JSON with safe fallback shape.
    readBansFile() {
        const empty = { emails: [], ips: [] };

        if (!fs.existsSync(this.bansPath)) {
            return empty;
        }

        try {
            const parsed = JSON.parse(fs.readFileSync(this.bansPath, 'utf8'));

            if (!parsed || typeof parsed !== 'object') {
                return empty;
            }

            return {
                emails: Array.isArray(parsed.emails) ? parsed.emails : [],
                ips: Array.isArray(parsed.ips) ? parsed.ips : [],
            };
        } catch {
            return empty;
        }
    }

    // Persist bans file in a readable JSON format.
    writeBansFile(bans) {
        fs.writeFileSync(this.bansPath, JSON.stringify(bans, null, 2), 'utf8');
    }

    // Public accessor used by admin endpoints.
    getBans() {
        return this.readBansFile();
    }

    // Check whether sender is blocked by email or hashed IP.
    isBanned({ email, secIp }) {
        // All ...@cubingtools.de emails are automatically banned to prevent abuse from users of the site.
        if (
            String(email || '')
                .toLowerCase()
                .endsWith('@cubingtools.de')
        ) {
            return true;
        }

        const bans = this.readBansFile();
        const normalizedEmail = this.normalizeEmail(email);
        const normalizedIp = this.normalizeBanValue('ip', secIp);

        const emailHit = bans.emails.some((entry) => entry?.value === normalizedEmail);
        const ipHit = bans.ips.some((entry) => entry?.value === normalizedIp);

        return emailHit || ipHit;
    }

    // Add email/IP ban entry if not already present.
    addBan({ type, value, user, reason }) {
        const normalizedType = String(type || '')
            .trim()
            .toLowerCase();
        const normalizedValue = this.normalizeBanValue(normalizedType, value);

        if (!normalizedValue || !['email', 'ip'].includes(normalizedType)) {
            return false;
        }

        const key = normalizedType === 'email' ? 'emails' : 'ips';
        const bans = this.readBansFile();

        const exists = bans[key].some((entry) => entry?.value === normalizedValue);
        if (exists) {
            return true;
        }

        bans[key].push({
            value: normalizedValue,
            reason: String(reason || '').trim(),
            user: String(user || '').trim(),
            createdAt: new Date().toISOString(),
        });

        this.writeBansFile(bans);
        return true;
    }

    // Remove email/IP ban entry.
    removeBan({ type, value }) {
        const normalizedType = String(type || '')
            .trim()
            .toLowerCase();
        const normalizedValue = this.normalizeBanValue(normalizedType, value);

        if (!normalizedValue || !['email', 'ip'].includes(normalizedType)) {
            return false;
        }

        const key = normalizedType === 'email' ? 'emails' : 'ips';
        const bans = this.readBansFile();
        const index = bans[key].findIndex((entry) => entry?.value === normalizedValue);

        if (index === -1) {
            return false;
        }

        bans[key].splice(index, 1);
        this.writeBansFile(bans);
        return true;
    }

    // Resolve an appeal and optionally remove the original ban.
    resolveAppeal({ type, value, unban = false, reason = '' }) {
        const normalizedType = String(type || '')
            .trim()
            .toLowerCase();
        const normalizedValue = this.normalizeBanValue(normalizedType, value);
        const normalizedReason = String(reason || '').trim();

        if (!normalizedValue || !['email', 'ip'].includes(normalizedType)) {
            return { success: false };
        }

        const key = normalizedType === 'email' ? 'emails' : 'ips';
        const bans = this.readBansFile();
        const index = bans[key].findIndex((entry) => entry?.value === normalizedValue);

        if (index === -1) {
            return { success: false };
        }

        const current = bans[key][index] || {};
        if (!current.appeal_pending && !current.appeal) {
            return { success: false };
        }

        const appeal = current.appeal ? { ...current.appeal } : null;
        const banReason = String(current.reason || '').trim();

        if (unban) {
            bans[key].splice(index, 1);
        } else {
            const updated = { ...current, appeal_pending: false };
            delete updated.appeal;
            bans[key][index] = updated;
        }

        this.writeBansFile(bans);
        return {
            success: true,
            appeal,
            type: normalizedType,
            value: normalizedValue,
            unban: Boolean(unban),
            reason: normalizedReason,
            banReason,
        };
    }

    // Entry point for contact and confirmation endpoints.
    async handleRequest(req, res) {
        const {
            name,
            email,
            tool,
            message,
            visits,
            'g-recaptcha-response': recaptchaResponse,
            recaptchaToken,
            isAppeal,
        } = req.body || {};

        const appealRequested = this.parseBooleanFlag(isAppeal);

        const { id } = req.query;

        if (id) {
            const valid = await this.validateConfirmationLink(id);
            if (valid) {
                return res.redirect(302, '/contact?status=confirmed');
            } else {
                return res.redirect(302, '/contact?status=invalid');
            }
        }

        const token = recaptchaResponse || recaptchaToken;
        const visitsCount = Number.isFinite(Number.parseInt(visits, 10))
            ? Number.parseInt(visits, 10)
            : null;

        if (!name || !email || !message || !token) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Field length limits to prevent oversized payloads being stored.
        if (
            String(name).length > 100 ||
            String(email).length > 320 ||
            String(message).length > 5000 ||
            (tool && String(tool).length > 100)
        ) {
            return res.status(400).json({
                success: false,
                error: 'One or more fields exceed the maximum allowed length',
            });
        }

        if (!isValidEmail(String(email))) {
            return res.status(400).json({ success: false, error: 'Invalid email address' });
        }

        const sec_ip = sha256Hash(req.ip || 'unknown');
        const senderIsBanned = this.isBanned({ email, secIp: sec_ip });

        if (senderIsBanned && !appealRequested) {
            return res.status(403).json({ success: false, error: 'Sender is banned' });
        }

        // Verify reCAPTCHA token
        this.createAssessment({ token })
            .then((score) => {
                // If score is null (due to missing credentials), allow through with warning
                if (score === null) {
                    console.warn(
                        'reCAPTCHA verification skipped (credentials not available). Message allowed through.',
                    );

                    if (appealRequested) {
                        const requestHost = req?.get?.('host') || '';
                        const appealResult = this.handleAppeals(
                            sec_ip,
                            name,
                            email,
                            tool,
                            message,
                            null,
                            requestHost,
                        );

                        if (!appealResult.success) {
                            return res
                                .status(400)
                                .json({ success: false, error: 'User is not banned.' });
                        }

                        if (appealResult.alreadyPending) {
                            return res.status(409).json({
                                success: false,
                                error: 'An appeal is already pending for this ban.',
                            });
                        }
                    }

                    return res.json({ success: true });
                }

                if (score && parseFloat(score) >= 0.5) {
                    const requestHost = req?.get?.('host') || '';

                    // Check if the message is an appeal
                    if (appealRequested) {
                        const appealResult = this.handleAppeals(
                            sec_ip,
                            name,
                            email,
                            tool,
                            message,
                            score,
                            requestHost,
                        );

                        if (!appealResult.success) {
                            return res
                                .status(400)
                                .json({ success: false, error: 'User is not banned.' });
                        }

                        if (appealResult.alreadyPending) {
                            return res.status(409).json({
                                success: false,
                                error: 'An appeal is already pending for this ban.',
                            });
                        }
                    } else {
                        this.sendConfirmationEmail({
                            sec_ip,
                            name,
                            email,
                            tool,
                            message,
                            visits: visitsCount,
                            recaptcha_score: score,
                            requestHost,
                        }).catch((error) => {
                            console.error('Failed to send confirmation email:', error);
                        });
                    }
                    return res.json({ success: true });
                } else {
                    return res
                        .status(400)
                        .json({ success: false, error: 'reCAPTCHA verification failed' });
                }
            })
            .catch((error) => {
                console.error('Error verifying reCAPTCHA:', error);
                // Graceful degradation: allow submission if verification fails
                console.warn('Allowing submission due to reCAPTCHA verification error');

                if (appealRequested) {
                    const requestHost = req?.get?.('host') || '';
                    const appealResult = this.handleAppeals(
                        sec_ip,
                        name,
                        email,
                        tool,
                        message,
                        null,
                        requestHost,
                    );

                    if (!appealResult.success) {
                        return res
                            .status(400)
                            .json({ success: false, error: 'User is not banned.' });
                    }

                    if (appealResult.alreadyPending) {
                        return res.status(409).json({
                            success: false,
                            error: 'An appeal is already pending for this ban.',
                        });
                    }
                }

                return res.json({ success: true });
            });
    }

    /**
     * Create an assessment to analyze the risk of a UI action.
     *
     * projectID: Your Google Cloud Project ID.
     * recaptchaSiteKey: The reCAPTCHA key associated with the site/app
     * token: The generated token obtained from the client.
     * recaptchaAction: Action name corresponding to the token.
     */
    async createAssessment({
        projectID = this.projectID,
        recaptchaKey = this.recaptchaKey,
        token = 'action-token',
        recaptchaAction = this.recaptchaAction,
    }) {
        const serviceAccountPath = path.join(__dirname, '..', 'secret', 'service-account.json');
        const hasEnvCredentials = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
        const hasFileCredentials = fs.existsSync(serviceAccountPath);

        if (!hasEnvCredentials && !hasFileCredentials) {
            console.warn(
                'reCAPTCHA Enterprise credentials not configured. Set GOOGLE_APPLICATION_CREDENTIALS or provide backend/secret/service-account.json.',
            );
            return null;
        }

        try {
            const clientOptions = hasEnvCredentials ? {} : { keyFilename: serviceAccountPath };
            const client = new RecaptchaEnterpriseServiceClient(clientOptions);
            const projectPath = client.projectPath(projectID);

            // Build the assessment request.
            const request = {
                assessment: {
                    event: {
                        token: token,
                        siteKey: recaptchaKey,
                    },
                },
                parent: projectPath,
            };

            const [response] = await client.createAssessment(request);

            // Check if the token is valid.
            if (!response.tokenProperties.valid) {
                console.log(
                    `The CreateAssessment call failed because the token was: ${response.tokenProperties.invalidReason}`,
                );
                return null;
            }

            // Check if the expected action was executed.
            // The `action` property is set by user client in the grecaptcha.enterprise.execute() method.
            if (response.tokenProperties.action === recaptchaAction) {
                // Get the risk score and the reason(s).
                // For more information on interpreting the assessment, see:
                // https://cloud.google.com/recaptcha/docs/interpret-assessment
                console.log(`The reCAPTCHA score is: ${response.riskAnalysis.score}`);
                response.riskAnalysis.reasons.forEach((reason) => {
                    console.log(reason);
                });

                return response.riskAnalysis.score;
            } else {
                console.log(
                    'The action attribute in your reCAPTCHA tag does not match the action you are expecting to score',
                );
                return null;
            }
        } catch (error) {
            // Check if this is a credentials error
            if (error.message && error.message.includes('Could not load the default credentials')) {
                console.warn(
                    'reCAPTCHA Enterprise credentials not configured. Set GOOGLE_APPLICATION_CREDENTIALS or provide backend/secret/service-account.json.',
                    error.message,
                );
                return null; // Signal that verification should be skipped
            }
            // Re-throw other errors
            throw error;
        }
    }

    // Save pending confirmation payload to Firestore.
    async saveMessage({ id, sec_ip, name, email, tool, message, visits, recaptcha_score }) {
        await this.pruneExpiredUnconfirmedMails();

        const doc = {
            id,
            secured_ip: sec_ip,
            name,
            email,
            tool,
            message,
            visits,
            timestamp: new Date().toISOString(),
            recaptcha_score: recaptcha_score,
            confirmed: false,
        };

        await this.db.collection('messages').doc(id).set(doc);
    }

    // Read all messages from Firestore.
    async readMessages() {
        const snapshot = await this.db.collection('messages').get();
        return snapshot.docs.map((doc) => doc.data());
    }

    // Drop unconfirmed messages older than TTL from Firestore.
    async pruneExpiredUnconfirmedMails() {
        const cutoff = Date.now() - this.unconfirmedTtlMs;
        const snapshot = await this.db.collection('messages').where('confirmed', '==', false).get();

        const batch = this.db.batch();
        let changed = false;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const timestampMs = Date.parse(data?.timestamp || '');
            if (!Number.isNaN(timestampMs) && timestampMs < cutoff) {
                batch.delete(doc.ref);
                changed = true;
            }
        }

        if (changed) {
            await batch.commit();
        }

        return { changed };
    }

    // Attach appeal metadata to matching ban entries.
    handleAppeals(sec_ip, name, email, tool, message, recaptcha_score, requestHost) {
        // Check if IP or Email is banned
        if (this.isBanned({ email, secIp: sec_ip })) {
            const bans = this.readBansFile();
            const normalizedEmail = this.normalizeEmail(email);
            const normalizedIp = this.normalizeBanValue('ip', sec_ip);

            const appealRecord = {
                requestedAt: new Date().toISOString(),
                name: String(name || '').trim(),
                email: normalizedEmail,
                tool: String(tool || '').trim() || 'other',
                message: String(message || '').trim(),
                recaptcha_score: recaptcha_score,
                requestHost: String(requestHost || '').trim(),
            };

            let updated = false;
            let alreadyPending = false;

            bans.emails = bans.emails.map((entry) => {
                if (entry.value === normalizedEmail) {
                    if (entry.appeal_pending) {
                        alreadyPending = true;
                        return entry;
                    }

                    updated = true;
                    return {
                        ...entry,
                        appeal_pending: true,
                        appeal: appealRecord,
                    };
                }
                return entry;
            });

            bans.ips = bans.ips.map((entry) => {
                if (entry.value === normalizedIp) {
                    if (entry.appeal_pending) {
                        alreadyPending = true;
                        return entry;
                    }

                    updated = true;
                    return {
                        ...entry,
                        appeal_pending: true,
                        appeal: appealRecord,
                    };
                }
                return entry;
            });

            if (updated) {
                this.writeBansFile(bans);
            }

            return { success: updated || alreadyPending, alreadyPending };
        } else {
            // Appeal attempted by someone who is not banned
            return { success: false, alreadyPending: false };
        }
    }

    // Send double opt-in confirmation email and queue pending message.
    async sendConfirmationEmail({
        sec_ip,
        name,
        email,
        tool,
        message,
        visits,
        recaptcha_score,
        requestHost,
    }) {
        const escapeHtml = (str) =>
            String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');

        const id = crypto.randomBytes(16).toString('hex');
        this.saveMessage({
            id,
            sec_ip,
            name,
            email,
            tool,
            message,
            visits,
            recaptcha_score,
            confirmed: false,
        });

        const safeName = escapeHtml(name);
        const safeTool = escapeHtml(tool);
        const safeMessage = escapeHtml(message);

        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD,
            },
        });

        try {
            let hostname = String(requestHost || '');
            hostname =
                hostname.includes(':8001') || hostname.includes('beta.cubingtools.de')
                    ? 'beta.cubingtools.de'
                    : 'cubingtools.de';
            const confirmationLink = `https://${hostname}/contact/confirm?id=${id}`;

            const templatePath = path.join(__dirname, '..', 'mail', 'confirm.html');
            const htmlContent = fs
                .readFileSync(templatePath, 'utf8')
                .replace(/\$\{safeName\}/g, safeName)
                .replace(/\$\{confirmationLink\}/g, confirmationLink)
                .replace(/\$\{safeTool\}/g, safeTool || 'Other')
                .replace(/\$\{safeMessage\}/g, safeMessage);

            // Strip control characters before inserting into email headers.
            const headerName = name.replace(/[\r\n\0]/g, '');
            const headerEmail = String(email || '').replace(/[\r\n\0]/g, '');

            const info = await transporter.sendMail({
                from: `CubingTools.de <${process.env.EMAIL_USER}>`,
                to: `${headerName}, <${headerEmail}>`,
                subject: 'Confirmation of your message to CubingTools',
                html: htmlContent,
            });
        } catch (error) {
            console.error('Failed to send confirmation email:', error);
        }
    }

    // Forward a confirmed contact message to the destination inbox.
    async sendMail(mail) {
        const escapeHtml = (str) =>
            String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');

        const safeName = escapeHtml(mail.name);
        const safeEmail = escapeHtml(mail.email);
        const safeTool = escapeHtml(mail.tool);
        const safeMessage = escapeHtml(mail.message);
        const safeVisits =
            mail.visits != null && Number.isFinite(Number.parseInt(mail.visits, 10))
                ? escapeHtml(Number.parseInt(mail.visits, 10).toString())
                : 'N/A';
        const safeRecaptchaScore =
            mail.recaptcha_score != null ? escapeHtml(mail.recaptcha_score.toString()) : 'N/A';

        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD,
            },
        });

        try {
            const templatePath = path.join(__dirname, '..', 'mail', 'mail.html');
            const htmlContent = fs
                .readFileSync(templatePath, 'utf8')
                .replace(/\$\{safeAuthor\}/g, safeName)
                .replace(/\$\{safeEmail\}/g, safeEmail)
                .replace(/\$\{safeTool\}/g, safeTool || 'Other')
                .replace(/\$\{safeMessage\}/g, safeMessage)
                .replace(/\$\{safeVisits\}/g, safeVisits)
                .replace(/\$\{recaptchaScore\}/g, safeRecaptchaScore);

            // Strip control characters before inserting into email headers.
            const headerReplyName = String(mail.name || '').replace(/[\r\n\0]/g, '');
            const headerReplyEmail = String(mail.email || '').replace(/[\r\n\0]/g, '');

            const info = await transporter.sendMail({
                from: `CubingTools.de <${process.env.EMAIL_USER}>`,
                replyTo: `${headerReplyName} <${headerReplyEmail}>`,
                to: `Sebastian <${process.env.EMAIL_RECEIVER}>`,
                subject: 'New contact message from CubingTools.de',
                html: htmlContent,
            });
        } catch (error) {
            console.error('Failed to send message email:', error);
        }
    }

    // Notify requester when an appeal has been approved or denied.
    async sendAppealDecisionEmail({ appeal, type, value, unban, reason, banReason }) {
        const recipientEmail = this.normalizeEmail(
            appeal?.email || (type === 'email' ? value : ''),
        );
        if (!recipientEmail) {
            return;
        }

        const escapeHtml = (str) =>
            String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\"/g, '&quot;')
                .replace(/'/g, '&#39;');

        const safeName = escapeHtml(String(appeal?.name || 'there').trim() || 'there');
        const safeTool = escapeHtml(String(appeal?.tool || 'Other').trim() || 'Other');
        const safeAppealMessage = escapeHtml(
            String(appeal?.message || '').trim() || 'No message provided.',
        );
        const safeAppealType = escapeHtml(type === 'ip' ? 'IP hash' : 'Email');
        const safeAppealValue = escapeHtml(String(value || '').trim() || 'N/A');
        const deniedReason =
            String(reason || '').trim() || String(banReason || '').trim() || 'No reason provided.';
        const safeDeniedReason = escapeHtml(deniedReason);

        const isApproved = Boolean(unban);
        const safeStatusLabel = isApproved ? 'Appeal approved' : 'Appeal denied';
        const safeHeadline = isApproved
            ? 'Your contact ban has been lifted.'
            : 'Your contact ban remains active.';
        const safeBodyMessage = isApproved
            ? 'We reviewed your appeal and decided to remove the ban. You can use the contact form again.'
            : 'We reviewed your appeal and decided to keep the ban in place. This decision is final. You can no longer appeal this ban.';
        const reasonBlock = isApproved
            ? ''
            : ` <tr>
                    <td style="padding:16px 24px;">
                        <span style="font-size:11px;font-weight:600;color:#A1A1AA;text-transform:uppercase;letter-spacing:0.08em;">Reason</span><br>
                        <span style="font-size:16px;color:#F4F4F5;line-height:1.7;white-space:pre-wrap;margin-top:6px;display:inline-block;">${safeDeniedReason}</span>
                    </td>
                </tr>`;

        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD,
            },
        });

        try {
            const templatePath = path.join(__dirname, '..', 'mail', 'appeal.html');
            const htmlContent = fs
                .readFileSync(templatePath, 'utf8')
                .replace(/\$\{safeName\}/g, safeName)
                .replace(/\$\{safeStatusLabel\}/g, safeStatusLabel)
                .replace(/\$\{safeHeadline\}/g, safeHeadline)
                .replace(/\$\{safeBodyMessage\}/g, safeBodyMessage)
                .replace(/\$\{safeTool\}/g, safeTool)
                .replace(/\$\{safeAppealType\}/g, safeAppealType)
                .replace(/\$\{safeAppealValue\}/g, safeAppealValue)
                .replace(/\$\{safeAppealMessage\}/g, safeAppealMessage)
                .replace(/\$\{reasonBlock\}/g, reasonBlock);

            await transporter.sendMail({
                from: `CubingTools.de <${process.env.EMAIL_USER}>`,
                to: recipientEmail,
                subject: isApproved
                    ? 'Your CubingTools appeal was approved'
                    : 'Your CubingTools appeal was denied',
                html: htmlContent,
            });
        } catch (error) {
            console.error('Failed to send appeal decision email:', error);
        }
    }

    // Confirm queued message by id and forward to final inbox.
    async validateConfirmationLink(id) {
        // Confirmation IDs are 32-character lowercase hex strings.
        if (!id || !/^[0-9a-f]{32}$/.test(String(id))) {
            return false;
        }

        await this.pruneExpiredUnconfirmedMails();

        const docRef = this.db.collection('messages').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return false;
        }

        const mail = doc.data();
        if (mail.confirmed) {
            return false;
        }

        mail.confirmed = true;
        await docRef.set(mail);

        this.sendMail(mail);

        return true;
    }

    // Delete message by id from Firestore.
    async removeMessage(id) {
        const docRef = this.db.collection('messages').doc(String(id));
        const doc = await docRef.get();
        if (!doc.exists) {
            return false;
        }

        await docRef.delete();
        return true;
    }

    // Set or clear the assignedTo field on a message.
    async assignMessage(id, assignedTo) {
        if (!id || !/^[0-9a-f]{32}$/.test(String(id))) {
            return false;
        }

        const docRef = this.db.collection('messages').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return false;
        }

        await docRef.update({ assignedTo: String(assignedTo || '').trim() || null });
        return true;
    }

    // Set or clear the done status on a message; returns { assignedTo } or false.
    async markMessageDone(id, done) {
        if (!id || !/^[0-9a-f]{32}$/.test(String(id))) {
            return false;
        }

        const docRef = this.db.collection('messages').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return false;
        }

        await docRef.update({ status: done ? 'done' : null });
        const data = doc.data();
        return { assignedTo: data.assignedTo || null };
    }

    // Return all messages after pruning expired unconfirmed entries.
    async getMessages() {
        await this.pruneExpiredUnconfirmedMails();
        const snapshot = await this.db.collection('messages').get();
        return snapshot.docs.map((doc) => doc.data());
    }
}

// Reusable SHA-256 helper used for password and IP hashing.
function sha256Hash(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}

// Simple RFC-5321-aware email format check (local@domain.tld).
function isValidEmail(email) {
    return (
        typeof email === 'string' &&
        email.length <= 320 &&
        /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
            email,
        )
    );
}
