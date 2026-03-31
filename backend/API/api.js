const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const path = require('path');
const packageJson = require('../../package.json');
const crypto = require('crypto');
const fs = require('fs');
const nodemailer = require('nodemailer');

const { RecaptchaEnterpriseServiceClient } = require('@google-cloud/recaptcha-enterprise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

function createRateLimiter(windowMs, max, message, options = {}) {
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: message },
        ...options,
    });
}

const contactLimiter = createRateLimiter(
    10 * 60 * 1000,
    8,
    'Too many contact requests, please try again later.',
);

const adminLoginLimiter = createRateLimiter(
    15 * 60 * 1000,
    10,
    'Too many login attempts, please try again later.',
    { skipSuccessfulRequests: true },
);

const adminVerifyLimiter = createRateLimiter(
    15 * 60 * 1000,
    120,
    'Too many verification requests, please try again later.',
);

const adminStatusLimiter = createRateLimiter(
    15 * 60 * 1000,
    60,
    'Too many status requests, please try again later.',
);

const adminTodosReadLimiter = createRateLimiter(
    15 * 60 * 1000,
    60,
    'Too many TODO read requests, please try again later.',
);

const adminTodosWriteLimiter = createRateLimiter(
    15 * 60 * 1000,
    20,
    'Too many TODO update requests, please try again later.',
);

const wcaLimiter = createRateLimiter(
    15 * 60 * 1000,
    180,
    'Too many WCA API requests, please try again later.',
);

class WcaApi {
    constructor() {
        this.baseUrl =
            'https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/master/api/persons';
        this.cacheTtlMs = 5 * 60 * 1000;
        this.responseCache = new Map();
    }

    normalizeWcaId(wcaId) {
        return String(wcaId || '')
            .trim()
            .toUpperCase();
    }

    pruneExpiredCache() {
        const now = Date.now();

        for (const [cacheKey, entry] of this.responseCache.entries()) {
            if (!entry.promise && entry.expiresAt <= now) {
                this.responseCache.delete(cacheKey);
            }
        }
    }

    async fetchCompetitorData(wcaId) {
        const cacheKey = this.normalizeWcaId(wcaId);
        const now = Date.now();

        this.pruneExpiredCache();

        const cachedEntry = this.responseCache.get(cacheKey);
        if (cachedEntry) {
            if (cachedEntry.promise) {
                return cachedEntry.promise;
            }

            if (cachedEntry.expiresAt > now) {
                return cachedEntry.data;
            }

            this.responseCache.delete(cacheKey);
        }

        const requestPromise = axios
            .get(`${this.baseUrl}/${cacheKey}.json`)
            .then((response) => {
                this.responseCache.set(cacheKey, {
                    data: response.data,
                    expiresAt: Date.now() + this.cacheTtlMs,
                });
                return response.data;
            })
            .catch((error) => {
                this.responseCache.delete(cacheKey);
                throw new Error(`Failed to fetch data for ${cacheKey}: ${error.message}`);
            });

        this.responseCache.set(cacheKey, {
            data: null,
            expiresAt: 0,
            promise: requestPromise,
        });

        try {
            return await requestPromise;
        } catch (error) {
            throw error;
        }
    }

    getCompetitorName(data) {
        return { name: data.name };
    }

    getAllResultsForEvent(data, event) {
        let allResults = [];
        for (const competition of Object.values(data.results)) {
            if (competition[event]) {
                allResults = allResults.concat(competition[event]);
            }
        }
        return allResults;
    }

    getSolves(allResults, solvecount) {
        let solves = allResults.flatMap((result) => result.solves.reverse());
        solves = solves.filter((result) => result > 0).slice(0, solvecount);
        return solves;
    }

    calculateAverage(solves) {
        if (solves.length === 0) {
            return null;
        }
        solves.sort((a, b) => a - b);
        solves = solves.slice(1, -1); // drop fastest and slowest
        const sum = solves.reduce((a, b) => a + b, 0);
        return sum / solves.length / 100; // convert ms → seconds
    }

    getAverages(allResults) {
        return allResults.flatMap((result) => result.average);
    }

    getPersonalRecords(data, event) {
        return {
            single: data.rank.singles.find((e) => e.eventId === event)?.best || null,
            average: data.rank.averages.find((e) => e.eventId === event)?.best || null,
        };
    }

    async handleRequest(req, res) {
        const { wcaId, event } = req.params;
        const { num, getsolves, getaverages } = req.query;

        try {
            const data = await this.fetchCompetitorData(wcaId);

            if (event === 'name') {
                return res.json(this.getCompetitorName(data));
            }

            const allResults = this.getAllResultsForEvent(data, event);
            const solvecount = parseInt(num, 10) || 12;

            if (getsolves) {
                return res.json({
                    allResults: allResults.flatMap((result) => result.solves.reverse()),
                });
            } else if (getaverages) {
                return res.json({ allAverages: this.getAverages(allResults) });
            }

            const solves = this.getSolves(allResults, solvecount);
            const avg = this.calculateAverage(solves);
            const pr = this.getPersonalRecords(data, event);

            return res.status(200).json({ average: avg, records: pr });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
}

class StatusApi {
    constructor() {
        this.password = process.env.STATUS_PAGE_PASSWORD || '';
    }

    isBetaRequest(req) {
        const host = req?.get?.('host') || '';
        return host.includes(':8001') || host.includes('beta.cubingtools.de');
    }

    handleRequest(req, res) {
        const uptime = process.uptime();
        const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

        const logFileSize = this.getLogFileSize(req);
        const logStats = this.analyzeLogs(req);

        return res.json({
            uptime: uptime.toFixed(2),
            memoryUsage: `${memoryUsage} MB`,
            logFileSize: `${logFileSize} KB`,
            logs: logStats,
        });
    }

    analyzeLogs(req) {
        const betaTest = this.isBetaRequest(req);

        const logPath = path.join(__dirname, '../log', betaTest ? 'beta.log' : 'server.log');

        if (!fs.existsSync(logPath)) {
            return { error: 'Log file not found' };
        }

        const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);

        const stats = {
            totalRequests: 0,
            methods: {},
            endpoints: {},
            statusCodes: {},
            statusCodeUrls: {},
            userAgents: {},
            avgResponseTimeMs: {},
            errorRate: 0,
            peakHours: {},
        };

        let totalErrors = 0;
        let responseTimesByEndpoint = {};

        for (const line of lines) {
            let entry;

            try {
                entry = JSON.parse(line);
            } catch {
                continue;
            }

            stats.totalRequests++;

            // HTTP methods
            stats.methods[entry.method] = (stats.methods[entry.method] || 0) + 1;

            // Endpoints
            stats.endpoints[entry.url] = (stats.endpoints[entry.url] || 0) + 1;

            // Status codes
            stats.statusCodes[entry.status] = (stats.statusCodes[entry.status] || 0) + 1;

            if (entry.status >= 400) totalErrors++;

            // Status code → URLs
            if (!stats.statusCodeUrls[entry.status]) {
                stats.statusCodeUrls[entry.status] = {};
            }

            stats.statusCodeUrls[entry.status][entry.url] =
                (stats.statusCodeUrls[entry.status][entry.url] || 0) + 1;

            // User agents
            if (entry.userAgent) {
                stats.userAgents[entry.userAgent] = (stats.userAgents[entry.userAgent] || 0) + 1;
            }

            // Avg response time per endpoint
            if (!responseTimesByEndpoint[entry.url]) {
                responseTimesByEndpoint[entry.url] = [];
            }
            responseTimesByEndpoint[entry.url].push(entry.durationMs || 0);

            // Peak traffic (by hour UTC)
            if (entry.time) {
                const hour = new Date(entry.time).getUTCHours();
                stats.peakHours[hour] = (stats.peakHours[hour] || 0) + 1;
            }
        }

        // Calculate averages
        for (const endpoint in responseTimesByEndpoint) {
            const times = responseTimesByEndpoint[endpoint];
            const avg = times.reduce((a, b) => a + b, 0) / times.length;

            stats.avgResponseTimeMs[endpoint] = avg.toFixed(2);
        }

        stats.errorRate =
            stats.totalRequests > 0
                ? ((totalErrors / stats.totalRequests) * 100).toFixed(2) + '%'
                : '0%';

        return stats;
    }

    getLogFileSize(req) {
        try {
            const betaTest = this.isBetaRequest(req);
            const logPath = path.join(__dirname, '..', 'log', betaTest ? 'beta.log' : 'server.log');
            const logFileSize = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
            // Return size in kilo Bytes with 2 decimal places
            return (logFileSize / 1024).toFixed(2);
        } catch {
            return '0.00';
        }
    }
}

function sha256Hash(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}

class AdminSessionApi {
    constructor() {
        this.password = process.env.STATUS_PAGE_PASSWORD || '';
        this.sessions = new Map();
        this.SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
    }

    _cleanExpired() {
        const now = Date.now();
        for (const [token, expiry] of this.sessions) {
            if (now > expiry) this.sessions.delete(token);
        }
    }

    createSession() {
        this._cleanExpired();
        const token = crypto.randomBytes(32).toString('hex');
        this.sessions.set(token, Date.now() + this.SESSION_TTL_MS);
        return token;
    }

    verifyToken(token) {
        if (!token || typeof token !== 'string') return false;
        const expiry = this.sessions.get(token);
        if (!expiry) return false;
        if (Date.now() > expiry) {
            this.sessions.delete(token);
            return false;
        }
        return true;
    }

    extractToken(req) {
        const auth = req.headers['authorization'] || '';
        if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
        return null;
    }

    handleLogin(req, res) {
        const { password } = req.body || {};
        if (!password || typeof password !== 'string') {
            return res.status(400).json({ error: 'Password required' });
        }

        const hashedInput = sha256Hash(password);
        let isValid = false;
        try {
            const a = Buffer.from(hashedInput, 'hex');
            const b = Buffer.from(this.password, 'hex');
            if (a.length === b.length && a.length > 0) {
                isValid = crypto.timingSafeEqual(a, b);
            }
        } catch {
            isValid = false;
        }

        if (!isValid) return res.status(401).json({ error: 'Unauthorized' });

        const token = this.createSession();
        return res.json({ token });
    }

    handleVerify(req, res) {
        const token = this.extractToken(req);
        if (!this.verifyToken(token)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.json({ valid: true });
    }

    requireAuth(req, res, next) {
        const token = this.extractToken(req);
        if (!this.verifyToken(token)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    }
}

class ContactApi {
    constructor() {
        this.password = process.env.CONTACT_API_PASSWORD || '';
        this.projectID = process.env.RECAPTCHA_PROJECT_ID || '';
        this.recaptchaKey = process.env.RECAPTCHA_SITE_KEY || '';
        this.recaptchaAction = process.env.RECAPTCHA_ACTION || '';
    }

    handleRequest(req, res) {
        const {
            name,
            email,
            tool,
            message,
            'g-recaptcha-response': recaptchaResponse,
            recaptchaToken,
        } = req.body || {};

        const { id } = req.query;

        if (id) {
            const valid = this.validateConfirmationLink(id);
            if (valid) {
                return res.redirect(302, '/contact/confirmed');
            } else {
                return res.redirect(302, '/contact/invalid');
            }
        }

        const token = recaptchaResponse || recaptchaToken;

        if (!name || !email || !message || !token) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Verify reCAPTCHA token
        this.createAssessment({ token })
            .then((score) => {
                // If score is null (due to missing credentials), allow through with warning
                if (score === null) {
                    console.warn(
                        'reCAPTCHA verification skipped (credentials not available). Message allowed through.',
                    );
                    return res.json({ success: true });
                }

                if (score && parseFloat(score) >= 0.5) {
                    // Here you would typically send the message via email or store it in a database
                    this.sendConfirmationEmail({
                        name,
                        email,
                        tool,
                        message,
                        recaptcha_score: score,
                    }).catch((error) => {
                        console.error('Failed to send confirmation email:', error);
                    });
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
        if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            console.warn(
                'reCAPTCHA Enterprise credentials not configured. Set GOOGLE_APPLICATION_CREDENTIALS environment variable.',
            );
            return null;
        }

        try {
            const client = new RecaptchaEnterpriseServiceClient();
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
                    'reCAPTCHA Enterprise credentials not configured. Set GOOGLE_APPLICATION_CREDENTIALS environment variable.',
                    error.message,
                );
                return null; // Signal that verification should be skipped
            }
            // Re-throw other errors
            throw error;
        }
    }

    // Saves messages to /mail/mails.json until they are confirmed by the sender
    saveMessage({ id, name, email, tool, message, recaptcha_score }) {
        const mailsPath = path.join(__dirname, 'mail', 'mails.json');
        let mails = [];
        if (fs.existsSync(mailsPath)) {
            try {
                mails = JSON.parse(fs.readFileSync(mailsPath, 'utf8'));
            } catch {
                mails = [];
            }
        }

        mails.push({
            id: id,
            name,
            email,
            tool,
            message,
            timestamp: new Date().toISOString(),
            recaptcha_score: recaptcha_score,
        });

        fs.writeFileSync(mailsPath, JSON.stringify(mails, null, 2), 'utf8');
    }

    async sendConfirmationEmail({ name, email, tool, message, recaptcha_score }) {
        const escapeHtml = (str) =>
            String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');

        const id = crypto.randomBytes(16).toString('hex');
        this.saveMessage({ id, name, email, tool, message, recaptcha_score });

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
            let hostname = req?.get?.('host') || '';
            hostname =
                hostname.includes(':8001') || hostname.includes('beta.cubingtools.de')
                    ? 'beta.cubingtools.de'
                    : 'cubingtools.de';
            const confirmationLink = `https://${hostname}/contact/confirm?id=${id}`;

            const templatePath = path.join(__dirname, 'mail', 'confirm.html');
            const htmlContent = fs
                .readFileSync(templatePath, 'utf8')
                .replace(/\$\{safeName\}/g, safeName)
                .replace(/\$\{confirmationLink\}/g, confirmationLink)
                .replace(/\$\{safeTool\}/g, safeTool || 'Other')
                .replace(/\$\{safeMessage\}/g, safeMessage);

            const info = await transporter.sendMail({
                from: `CubingTools.de <${process.env.EMAIL_USER}>`,
                to: `${name}, <${email}>`,
                subject: 'Confirmation of your message to CubingTools',
                html: htmlContent,
            });
        } catch (error) {
            console.error('Failed to send confirmation email:', error);
        }
    }

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
            const templatePath = path.join(__dirname, 'mail', 'mail.html');
            const htmlContent = fs
                .readFileSync(templatePath, 'utf8')
                .replace(/\$\{safeAuthor\}/g, safeName)
                .replace(/\$\{safeEmail\}/g, safeEmail)
                .replace(/\$\{safeTool\}/g, safeTool || 'Other')
                .replace(/\$\{safeMessage\}/g, safeMessage)
                .replace(/\$\{recaptchaScore\}/g, safeRecaptchaScore);

            const info = await transporter.sendMail({
                from: `${mail.name}, <${mail.email}>`,
                to: `Sebastian <${process.env.EMAIL_RECEIVER}>`,
                subject: 'New contact message from CubingTools.de',
                html: htmlContent,
            });
        } catch (error) {
            console.error('Failed to send message email:', error);
        }
    }

    validateConfirmationLink(id) {
        const mailsPath = path.join(__dirname, 'mail', 'mails.json');
        if (!fs.existsSync(mailsPath)) {
            return false;
        }

        let mails = [];
        try {
            mails = JSON.parse(fs.readFileSync(mailsPath, 'utf8'));
        } catch {
            return false;
        }

        const mailIndex = mails.findIndex((mail) => mail.id === id);
        if (mailIndex === -1) {
            return false;
        }

        const mail = mails[mailIndex];
        // Remove the mail from the pending list
        mails.splice(mailIndex, 1);
        fs.writeFileSync(mailsPath, JSON.stringify(mails, null, 2), 'utf8');

        this.sendMail(mail);

        return true;
    }
}

const wcaApi = new WcaApi();
const statusApi = new StatusApi();
const contactApi = new ContactApi();
const adminSessionApi = new AdminSessionApi();

// Contact API endpoint
router.post('/api/contact', contactLimiter, (req, res) => contactApi.handleRequest(req, res));

router.get('/contact/confirm', (req, res) => contactApi.handleRequest(req, res));

// Admin session endpoints
router.post('/api/admin/login', adminLoginLimiter, (req, res) =>
    adminSessionApi.handleLogin(req, res),
);
router.get('/api/admin/verify', adminVerifyLimiter, (req, res) =>
    adminSessionApi.handleVerify(req, res),
);

// Status API endpoint — requires valid session token
router.post(
    '/api/admin/status',
    adminStatusLimiter,
    (req, res, next) => adminSessionApi.requireAuth(req, res, next),
    (req, res) => statusApi.handleRequest(req, res),
);

// Admin todos endpoint — serves TODO.md content
router.get(
    '/api/admin/todos',
    adminTodosReadLimiter,
    (req, res, next) => adminSessionApi.requireAuth(req, res, next),
    (req, res) => {
        const todoPath = path.join(__dirname, '../../md/TODO.md');
        if (!fs.existsSync(todoPath)) {
            return res.status(404).json({ error: 'TODO file not found' });
        }
        const content = fs.readFileSync(todoPath, 'utf8');
        return res.json({ content });
    },
);

// Admin todos update endpoint — writes TODO.md content
router.post(
    '/api/admin/todos',
    adminTodosWriteLimiter,
    (req, res, next) => adminSessionApi.requireAuth(req, res, next),
    (req, res) => {
        const { content } = req.body || {};
        if (typeof content !== 'string') {
            return res.status(400).json({ error: 'Invalid todo content' });
        }

        const todoPath = path.join(__dirname, '../../md/TODO.md');
        try {
            fs.writeFileSync(todoPath, content, 'utf8');
            return res.json({ success: true });
        } catch {
            return res.status(500).json({ error: 'Failed to update TODO file' });
        }
    },
);

// Wire class into router
router.get('/api/wca/:wcaId/:event', wcaLimiter, (req, res) => wcaApi.handleRequest(req, res));

router.get('/api/version', (req, res) => {
    res.json({ version: packageJson.version });
});

module.exports = router;
