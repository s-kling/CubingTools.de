const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const path = require('path');
const packageJson = require('../../package.json');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const fs = require('fs');
const nodemailer = require('nodemailer');

const BCRYPT_ROUNDS = 12;

const { RecaptchaEnterpriseServiceClient } = require('@google-cloud/recaptcha-enterprise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Shared helper to create endpoint-specific rate limiters with a consistent payload shape.
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

const adminMessagesReadLimiter = createRateLimiter(
    15 * 60 * 1000,
    120,
    'Too many messages requests, please try again later.',
);

const adminMessagesWriteLimiter = createRateLimiter(
    15 * 60 * 1000,
    40,
    'Too many message updates, please try again later.',
);

const adminMessagesBanLimiter = createRateLimiter(
    15 * 60 * 1000,
    40,
    'Too many ban requests, please try again later.',
);

const adminChangePasswordLimiter = createRateLimiter(
    15 * 60 * 1000,
    5,
    'Too many password change attempts, please try again later.',
);

const adminUsersReadLimiter = createRateLimiter(
    15 * 60 * 1000,
    60,
    'Too many user list requests, please try again later.',
);

const adminUsersWriteLimiter = createRateLimiter(
    15 * 60 * 1000,
    20,
    'Too many user management requests, please try again later.',
);

const wcaLimiter = createRateLimiter(
    15 * 60 * 1000,
    180,
    'Too many WCA API requests, please try again later.',
);

// Encapsulates WCA profile fetch + result aggregation helpers used by the public API.
class WcaApi {
    constructor() {
        // Raw GitHub-hosted JSON snapshots for WCA persons.
        this.baseUrl =
            'https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/master/api/persons';
        // Keep fetched responses for a short period to reduce upstream requests.
        this.cacheTtlMs = 5 * 60 * 1000;
        this.responseCache = new Map();
    }

    // Canonical key for cache lookups.
    normalizeWcaId(wcaId) {
        return String(wcaId || '')
            .trim()
            .toUpperCase();
    }

    // Validate that a WCA ID matches the official format (e.g. 2014SMIT01).
    isValidWcaId(wcaId) {
        return /^[0-9]{4}[A-Z]{4}[0-9]{2}$/.test(wcaId);
    }

    // Remove expired non-pending entries from in-memory cache.
    pruneExpiredCache() {
        const now = Date.now();

        for (const [cacheKey, entry] of this.responseCache.entries()) {
            if (!entry.promise && entry.expiresAt <= now) {
                this.responseCache.delete(cacheKey);
            }
        }
    }

    // Fetch competitor data with de-duplication for in-flight requests.
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

    // Lightweight endpoint to resolve competitor name.
    getCompetitorName(data) {
        return { name: data.name };
    }

    // Flatten all rounds for one event across all competitions.
    getAllResultsForEvent(data, event) {
        let allResults = [];
        for (const competition of Object.values(data.results)) {
            if (competition[event]) {
                allResults = allResults.concat(competition[event]);
            }
        }
        return allResults;
    }

    // Build a latest-solves list, keeping only valid solves.
    getSolves(allResults, solvecount) {
        let solves = allResults.flatMap((result) => result.solves.reverse());
        solves = solves.filter((result) => result > 0).slice(0, solvecount);
        return solves;
    }

    // Trimmed mean: drop best + worst and return seconds.
    calculateAverage(solves) {
        if (solves.length === 0) {
            return null;
        }
        solves.sort((a, b) => a - b);
        solves = solves.slice(1, -1); // drop fastest and slowest
        const sum = solves.reduce((a, b) => a + b, 0);
        return sum / solves.length / 100; // convert ms → seconds
    }

    // Return all average values for an event timeline.
    getAverages(allResults) {
        return allResults.flatMap((result) => result.average);
    }

    // Pull current PRs from rank sections.
    getPersonalRecords(data, event) {
        return {
            single: data.rank.singles.find((e) => e.eventId === event)?.best || null,
            average: data.rank.averages.find((e) => e.eventId === event)?.best || null,
        };
    }

    // Main request handler for /api/wca/:wcaId/:event.
    async handleRequest(req, res) {
        const { wcaId, event } = req.params;
        const { num, getsolves, getaverages } = req.query;

        const normalizedId = this.normalizeWcaId(wcaId);
        if (!this.isValidWcaId(normalizedId)) {
            return res.status(400).json({ error: 'Invalid WCA ID format' });
        }

        try {
            const data = await this.fetchCompetitorData(normalizedId);

            if (event === 'name') {
                return res.json(this.getCompetitorName(data));
            }

            const allResults = this.getAllResultsForEvent(data, event);
            const rawNum = Number.parseInt(num, 10);
            const solvecount = Number.isFinite(rawNum) && rawNum > 0 ? Math.min(rawNum, 200) : 12;

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

// Provides lightweight operational telemetry for the protected status page.
class StatusApi {
    constructor() {
        this.password = process.env.STATUS_PAGE_PASSWORD || '';
    }

    // Detect beta traffic to route to the beta log file.
    isBetaRequest(req) {
        const host = req?.get?.('host') || '';
        return host.includes(':8001') || host.includes('beta.cubingtools.de');
    }

    // Build full status payload including summarized logs.
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
            logEntries: logStats.logEntries || [],
        });
    }

    // Parse JSON line logs and aggregate diagnostics for the dashboard.
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
            logEntries: [],
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

            stats.logEntries.push({
                time: entry.time || null,
                method: entry.method || null,
                url: entry.url || null,
                status: entry.status ?? null,
                durationMs: entry.durationMs ?? null,
                userAgent: entry.userAgent || null,
            });

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

    // Return current log file size in KB.
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

// Session-backed admin auth + message moderation endpoints.
class AdminSessionApi {
    constructor() {
        this.usersPath = path.join(__dirname, '..', 'secret', 'users.json');
        // In-memory token -> { expiry, username, role } map.
        this.sessions = new Map();
        this.SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
    }

    // Load users from the JSON file.
    _loadUsers() {
        try {
            return JSON.parse(fs.readFileSync(this.usersPath, 'utf8'));
        } catch {
            return [];
        }
    }

    // Persist users to the JSON file.
    _saveUsers(users) {
        fs.writeFileSync(this.usersPath, JSON.stringify(users, null, 4), 'utf8');
    }

    // Remove stale sessions before issuing/validating tokens.
    _cleanExpired() {
        const now = Date.now();
        for (const [token, session] of this.sessions) {
            if (now > session.expiry) this.sessions.delete(token);
        }
    }

    // Create a new bearer token with configured TTL.
    createSession(username, role) {
        this._cleanExpired();
        const token = crypto.randomBytes(32).toString('hex');
        this.sessions.set(token, { expiry: Date.now() + this.SESSION_TTL_MS, username, role });
        return token;
    }

    // Validate token and return session metadata or null.
    verifyToken(token) {
        if (!token || typeof token !== 'string') return null;
        const session = this.sessions.get(token);
        if (!session) return null;
        if (Date.now() > session.expiry) {
            this.sessions.delete(token);
            return null;
        }
        return session;
    }

    // Extract bearer token from Authorization header.
    extractToken(req) {
        const auth = req.headers['authorization'] || '';
        if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
        return null;
    }

    // Authenticate admin user and issue a session token.
    async handleLogin(req, res) {
        const { username, password } = req.body || {};
        if (
            !username ||
            typeof username !== 'string' ||
            !password ||
            typeof password !== 'string'
        ) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const normalizedUsername = username.trim().toLowerCase();
        const users = this._loadUsers();
        const user = users.find((u) => u.username.toLowerCase() === normalizedUsername);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        let isValid = false;
        try {
            isValid = await bcrypt.compare(password, user.password);
        } catch {
            isValid = false;
        }

        console.log(isValid);

        if (!isValid) return res.status(401).json({ error: 'Unauthorized' });

        const token = this.createSession(user.username, user.role);
        return res.json({
            token,
            role: user.role,
            requiresPasswordChange: Boolean(user.firstLogin),
        });
    }

    // Stateless endpoint to verify token validity.
    handleVerify(req, res) {
        const token = this.extractToken(req);
        const session = this.verifyToken(token);
        if (!session) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const users = this._loadUsers();
        const user = users.find((u) => u.username === session.username);
        return res.json({
            valid: true,
            role: session.role,
            username: session.username,
            color: user?.color || '#888888',
            requiresPasswordChange: Boolean(user?.firstLogin),
        });
    }

    // Update the current user's display color.
    updateUserColor(req, res) {
        const token = this.extractToken(req);
        const session = this.verifyToken(token);
        if (!session) return res.status(401).json({ error: 'Unauthorized' });

        const { color } = req.body || {};
        if (!color || typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
            return res.status(400).json({ error: 'Invalid color. Must be a 6-digit hex color.' });
        }

        const users = this._loadUsers();
        const idx = users.findIndex((u) => u.username === session.username);
        if (idx === -1) return res.status(404).json({ error: 'User not found' });

        users[idx].color = color;
        this._saveUsers(users);
        return res.json({ success: true, color });
    }

    // Update any user's display color (admin only).
    updateAnyUserColor(req, res) {
        const { username } = req.params;
        if (!username || typeof username !== 'string') {
            return res.status(400).json({ error: 'Username is required' });
        }

        const { color } = req.body || {};
        if (!color || typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
            return res.status(400).json({ error: 'Invalid color. Must be a 6-digit hex color.' });
        }

        const users = this._loadUsers();
        const idx = users.findIndex(
            (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
        );
        if (idx === -1) return res.status(404).json({ error: 'User not found' });

        users[idx].color = color;
        this._saveUsers(users);
        return res.json({ success: true, color });
    }

    // Express middleware guard for protected admin routes (any role).
    requireAuth(req, res, next) {
        const token = this.extractToken(req);
        const session = this.verifyToken(token);
        if (!session) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        req.adminUser = { username: session.username, role: session.role };
        next();
    }

    // Express middleware guard restricted to admin role only.
    requireAdmin(req, res, next) {
        const token = this.extractToken(req);
        const session = this.verifyToken(token);
        if (!session) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (session.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden: admin access required' });
        }
        req.adminUser = { username: session.username, role: session.role };
        next();
    }

    // Update the current user's password and clear the first-login flag.
    async handleChangePassword(req, res) {
        const token = this.extractToken(req);
        const session = this.verifyToken(token);
        if (!session) return res.status(401).json({ error: 'Unauthorized' });

        const { newPassword } = req.body || {};
        if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters' });
        }

        const users = this._loadUsers();
        const idx = users.findIndex((u) => u.username === session.username);
        if (idx === -1) return res.status(404).json({ error: 'User not found' });

        users[idx].password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        users[idx].firstLogin = false;
        this._saveUsers(users);

        return res.json({ success: true });
    }

    // Return list of users (passwords omitted) for admin UI.
    listUsers(req, res) {
        const users = this._loadUsers();
        const safe = users.map(({ password: _pw, ...rest }) => rest);
        return res.json({ users: safe });
    }

    // Return usernames and colors (any authenticated user, for assignment dropdowns).
    listUsernames(req, res) {
        const users = this._loadUsers();
        return res.json({
            users: users.map((u) => ({ username: u.username, color: u.color || '#888888' })),
        });
    }

    // Add a new user (admin only).
    async addUser(req, res) {
        const { username, role } = req.body || {};
        if (!username || typeof username !== 'string' || !username.trim()) {
            return res.status(400).json({ error: 'Username is required' });
        }
        const normalizedRole = String(role || 'operator').trim();
        if (!['admin', 'operator'].includes(normalizedRole)) {
            return res.status(400).json({ error: 'Role must be "admin" or "operator"' });
        }

        const users = this._loadUsers();
        const exists = users.some(
            (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
        );
        if (exists) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        // Generate a random color for the user
        const randomColor = `#${crypto.randomBytes(3).toString('hex')}`;

        const defaultPasswordHash = await bcrypt.hash('cubingtools', BCRYPT_ROUNDS);
        users.push({
            username: username.trim(),
            password: defaultPasswordHash,
            role: normalizedRole,
            color: randomColor,
            firstLogin: true,
        });
        this._saveUsers(users);
        return res.status(201).json({ success: true });
    }

    // Delete a user by username (admin only, cannot delete self).
    deleteUser(req, res) {
        const { username } = req.params;
        const session = this.verifyToken(this.extractToken(req));
        if (!username || typeof username !== 'string') {
            return res.status(400).json({ error: 'Username is required' });
        }
        if (session && session.username.toLowerCase() === username.trim().toLowerCase()) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        const users = this._loadUsers();
        const idx = users.findIndex(
            (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
        );
        if (idx === -1) {
            return res.status(404).json({ error: 'User not found' });
        }

        users.splice(idx, 1);
        this._saveUsers(users);
        // Invalidate any active sessions for the deleted user.
        for (const [token, s] of this.sessions) {
            if (s.username.toLowerCase() === username.trim().toLowerCase()) {
                this.sessions.delete(token);
            }
        }
        return res.json({ success: true });
    }

    // Update a user's role (admin only, cannot demote self).
    updateUserRole(req, res) {
        const { username } = req.params;
        const { role } = req.body || {};
        const session = this.verifyToken(this.extractToken(req));

        if (!username || typeof username !== 'string') {
            return res.status(400).json({ error: 'Username is required' });
        }
        if (!['admin', 'operator'].includes(role)) {
            return res.status(400).json({ error: 'Role must be "admin" or "operator"' });
        }
        if (session && session.username.toLowerCase() === username.trim().toLowerCase()) {
            return res.status(400).json({ error: 'Cannot change your own role' });
        }

        const users = this._loadUsers();
        const idx = users.findIndex(
            (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
        );
        if (idx === -1) {
            return res.status(404).json({ error: 'User not found' });
        }

        users[idx].role = role;
        this._saveUsers(users);
        return res.json({ success: true });
    }

    // Reset a user's password to the default and flag firstLogin (admin only).
    async resetUserPassword(req, res) {
        const { username } = req.params;
        if (!username || typeof username !== 'string') {
            return res.status(400).json({ error: 'Username is required' });
        }

        const users = this._loadUsers();
        const idx = users.findIndex(
            (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
        );
        if (idx === -1) {
            return res.status(404).json({ error: 'User not found' });
        }

        users[idx].password = await bcrypt.hash('cubingtools', BCRYPT_ROUNDS);
        users[idx].firstLogin = true;
        this._saveUsers(users);
        return res.json({ success: true });
    }

    // Assign or unassign a message to a specific admin user.
    handleAssignMessage(req, res) {
        const id = String(req?.params?.id || '').trim();
        if (!id) {
            return res.status(400).json({ error: 'Message id required' });
        }

        const { assignedTo } = req.body || {};
        const normalizedAssignee = String(assignedTo || '').trim() || null;

        if (normalizedAssignee) {
            const users = this._loadUsers();
            const exists = users.some(
                (u) => u.username.toLowerCase() === normalizedAssignee.toLowerCase(),
            );
            if (!exists) {
                return res.status(404).json({ error: 'User not found' });
            }
        }

        const updated = contactApi.assignMessage(id, normalizedAssignee);
        if (!updated) {
            return res.status(404).json({ error: 'Message not found' });
        }

        return res.json({ success: true });
    }

    // Mark or unmark a message as done (admin or assigned user only).
    handleMarkMessageDone(req, res) {
        const id = String(req?.params?.id || '').trim();
        if (!id) {
            return res.status(400).json({ error: 'Message id required' });
        }

        const { done } = req.body || {};
        const isDone = Boolean(done);
        const { username, role } = req.adminUser;

        const messages = contactApi.getMessages();
        const message = messages.find((m) => m.id === id);
        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        if (role !== 'admin' && message.assignedTo !== username) {
            return res.status(403).json({ error: 'Not authorized to mark this message done' });
        }

        const updated = contactApi.markMessageDone(id, isDone);
        if (!updated) {
            return res.status(404).json({ error: 'Message not found' });
        }

        return res.json({ success: true });
    }

    // Return moderation data for admin UI.
    getAdminMessages(req, res) {
        const messages = contactApi.getMessages();
        const bans = contactApi.getBans();
        return res.json({ messages, bans });
    }

    // Delete one queued/confirmed message by ID.
    deleteAdminMessage(req, res) {
        const id = String(req?.params?.id || '').trim();
        if (!id) {
            return res.status(400).json({ error: 'Message id required' });
        }

        const removed = contactApi.removeMessage(id);
        if (!removed) {
            return res.status(404).json({ error: 'Message not found' });
        }

        return res.json({ success: true });
    }

    // Return only ban-list payload.
    getAdminBans(req, res) {
        return res.json({ bans: contactApi.getBans() });
    }

    // Add a new ban entry.
    addAdminBan(req, res) {
        const { type, value, reason } = req.body || {};
        const session = this.verifyToken(this.extractToken(req));
        const user = session?.username || 'unknown';
        const added = contactApi.addBan({ type, value, user, reason });

        if (!added) {
            return res.status(400).json({ error: 'Invalid ban payload' });
        }

        return res.json({ success: true, bans: contactApi.getBans() });
    }

    // Remove an existing ban entry.
    removeAdminBan(req, res) {
        const { type, value } = req.body || {};
        const removed = contactApi.removeBan({ type, value });

        if (!removed) {
            return res.status(404).json({ error: 'Ban entry not found' });
        }

        return res.json({ success: true, bans: contactApi.getBans() });
    }

    // Resolve pending appeals; optionally unban.
    resolveAdminAppeal(req, res) {
        const { type, value, unban, reason } = req.body || {};
        const unbanRequested = Boolean(unban);
        const resolutionReason = String(reason || '').trim();
        const resolved = contactApi.resolveAppeal({
            type,
            value,
            unban: unbanRequested,
            reason: resolutionReason,
        });

        if (!resolved?.success) {
            return res.status(404).json({ error: 'Appeal entry not found' });
        }

        contactApi
            .sendAppealDecisionEmail({
                appeal: resolved.appeal,
                type: resolved.type,
                value: resolved.value,
                unban: resolved.unban,
                reason: resolved.reason,
                banReason: resolved.banReason,
            })
            .catch((error) => {
                console.error('Failed to send appeal decision email:', error);
            });

        return res.json({ success: true, bans: contactApi.getBans() });
    }
}

// Handles contact submissions, confirmation flow, and moderation storage.
class ContactApi {
    constructor() {
        this.password = process.env.CONTACT_API_PASSWORD || '';
        this.projectID = process.env.RECAPTCHA_PROJECT_ID || '';
        this.recaptchaKey = process.env.RECAPTCHA_SITE_KEY || '';
        this.recaptchaAction = process.env.RECAPTCHA_ACTION || '';
        this.mailsPath = path.join(__dirname, 'mail', 'mails.json');
        this.bansPath = path.join(__dirname, 'mail', 'bans.json');
        // Pending confirmation messages auto-expire to keep storage clean.
        this.unconfirmedTtlMs = 60 * 60 * 1000;
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
    handleRequest(req, res) {
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
            const valid = this.validateConfirmationLink(id);
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

    // Save pending confirmation payload until user clicks confirmation link.
    saveMessage({ id, sec_ip, name, email, tool, message, visits, recaptcha_score }) {
        let mails = this.readMailsFile();
        const pruneResult = this.pruneExpiredUnconfirmedMails(mails);
        mails = pruneResult.mails;

        mails.push({
            id: id,
            secured_ip: sec_ip,
            name,
            email,
            tool,
            message,
            visits,
            timestamp: new Date().toISOString(),
            recaptcha_score: recaptcha_score,
            confirmed: false,
        });

        fs.writeFileSync(this.mailsPath, JSON.stringify(mails, null, 2), 'utf8');
    }

    // Read queued messages with fault-tolerant parsing.
    readMailsFile() {
        if (!fs.existsSync(this.mailsPath)) {
            return [];
        }

        try {
            const parsed = JSON.parse(fs.readFileSync(this.mailsPath, 'utf8'));
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    // Drop unconfirmed messages older than TTL.
    pruneExpiredUnconfirmedMails(mails) {
        const cutoff = Date.now() - this.unconfirmedTtlMs;
        let changed = false;

        const filtered = mails.filter((mail) => {
            if (mail?.confirmed) {
                return true;
            }

            const timestampMs = Date.parse(mail?.timestamp || '');
            if (Number.isNaN(timestampMs)) {
                return true;
            }

            const isExpired = timestampMs < cutoff;
            if (isExpired) {
                changed = true;
                return false;
            }

            return true;
        });

        return { mails: filtered, changed };
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

            const templatePath = path.join(__dirname, 'mail', 'confirm.html');
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
            const templatePath = path.join(__dirname, 'mail', 'mail.html');
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
            const templatePath = path.join(__dirname, 'mail', 'appeal.html');
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
    validateConfirmationLink(id) {
        // Confirmation IDs are 32-character lowercase hex strings.
        if (!id || !/^[0-9a-f]{32}$/.test(String(id))) {
            return false;
        }

        if (!fs.existsSync(this.mailsPath)) {
            return false;
        }

        let mails = this.readMailsFile();
        if (!mails.length) {
            return false;
        }

        const pruneResult = this.pruneExpiredUnconfirmedMails(mails);
        mails = pruneResult.mails;

        const mailIndex = mails.findIndex((mail) => mail.id === id);
        if (mailIndex === -1) {
            if (pruneResult.changed) {
                fs.writeFileSync(this.mailsPath, JSON.stringify(mails, null, 2), 'utf8');
            }
            return false;
        }

        const mail = mails[mailIndex];
        if (mail.confirmed) {
            return false;
        }

        mail.confirmed = true;
        mails[mailIndex] = mail;
        fs.writeFileSync(this.mailsPath, JSON.stringify(mails, null, 2), 'utf8');

        this.sendMail(mail);

        return true;
    }

    // Delete message by id from local storage.
    removeMessage(id) {
        if (!fs.existsSync(this.mailsPath)) {
            return false;
        }

        let mails = this.readMailsFile();
        if (!mails.length) {
            return false;
        }

        const pruneResult = this.pruneExpiredUnconfirmedMails(mails);
        mails = pruneResult.mails;

        const mailIndex = mails.findIndex((mail) => mail.id === id);
        if (mailIndex === -1) {
            if (pruneResult.changed) {
                fs.writeFileSync(this.mailsPath, JSON.stringify(mails, null, 2), 'utf8');
            }
            return false;
        }

        // Remove the mail from the pending list
        mails.splice(mailIndex, 1);
        fs.writeFileSync(this.mailsPath, JSON.stringify(mails, null, 2), 'utf8');

        return true;
    }

    // Set or clear the assignedTo field on a message.
    assignMessage(id, assignedTo) {
        if (!id || !/^[0-9a-f]{32}$/.test(String(id))) {
            return false;
        }

        const mails = this.readMailsFile();
        const idx = mails.findIndex((mail) => mail.id === id);
        if (idx === -1) {
            return false;
        }

        mails[idx] = { ...mails[idx], assignedTo: String(assignedTo || '').trim() || null };
        fs.writeFileSync(this.mailsPath, JSON.stringify(mails, null, 2), 'utf8');
        return true;
    }

    // Set or clear the done status on a message; returns { success, assignedTo } or false.
    markMessageDone(id, done) {
        if (!id || !/^[0-9a-f]{32}$/.test(String(id))) {
            return false;
        }

        const mails = this.readMailsFile();
        const idx = mails.findIndex((mail) => mail.id === id);
        if (idx === -1) {
            return false;
        }

        mails[idx] = { ...mails[idx], status: done ? 'done' : null };
        fs.writeFileSync(this.mailsPath, JSON.stringify(mails, null, 2), 'utf8');
        return { assignedTo: mails[idx].assignedTo || null };
    }

    // Return all messages after pruning expired unconfirmed entries.
    getMessages() {
        if (!fs.existsSync(this.mailsPath)) {
            return [];
        }

        let mails = this.readMailsFile();
        if (!mails.length) {
            return [];
        }

        const pruneResult = this.pruneExpiredUnconfirmedMails(mails);
        mails = pruneResult.mails;

        if (pruneResult.changed) {
            fs.writeFileSync(this.mailsPath, JSON.stringify(mails, null, 2), 'utf8');
        }

        return mails;
    }
}

const wcaApi = new WcaApi();
const statusApi = new StatusApi();
const contactApi = new ContactApi();
const adminSessionApi = new AdminSessionApi();

// Public contact submission endpoint.
router.post('/api/contact', contactLimiter, (req, res) => contactApi.handleRequest(req, res));

// Public contact confirmation callback endpoint.
router.get('/contact/confirm', (req, res) => contactApi.handleRequest(req, res));

// Admin authentication endpoints.
router.post('/api/admin/login', adminLoginLimiter, (req, res) =>
    adminSessionApi.handleLogin(req, res),
);
router.get('/api/admin/verify', adminVerifyLimiter, (req, res) =>
    adminSessionApi.handleVerify(req, res),
);

// Protected password change endpoint (any authenticated user).
router.post('/api/admin/change-password', adminChangePasswordLimiter, (req, res) =>
    adminSessionApi.handleChangePassword(req, res),
);

// User management endpoints (admin only).
router.get(
    '/api/admin/users',
    adminUsersReadLimiter,
    adminSessionApi.requireAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.listUsers(req, res),
);

router.post(
    '/api/admin/users',
    adminUsersWriteLimiter,
    adminSessionApi.requireAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.addUser(req, res),
);

router.delete(
    '/api/admin/users/:username',
    adminUsersWriteLimiter,
    adminSessionApi.requireAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.deleteUser(req, res),
);

router.patch(
    '/api/admin/users/:username/role',
    adminUsersWriteLimiter,
    adminSessionApi.requireAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.updateUserRole(req, res),
);

router.post(
    '/api/admin/users/:username/reset-password',
    adminUsersWriteLimiter,
    adminSessionApi.requireAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.resetUserPassword(req, res),
);

router.patch(
    '/api/admin/users/me/color',
    adminUsersWriteLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.updateUserColor(req, res),
);

router.patch(
    '/api/admin/users/:username/color',
    adminUsersWriteLimiter,
    adminSessionApi.requireAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.updateAnyUserColor(req, res),
);

// Protected status endpoint.
router.post(
    '/api/admin/status',
    adminStatusLimiter,
    (req, res, next) => adminSessionApi.requireAuth(req, res, next),
    (req, res) => statusApi.handleRequest(req, res),
);

// Protected TODO read endpoint.
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

// Protected TODO write endpoint.
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

// Protected moderation and ban-management endpoints.
router.get(
    '/api/admin/messages',
    adminMessagesReadLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.getAdminMessages(req, res),
);

router.delete(
    '/api/admin/messages/:id',
    adminMessagesWriteLimiter,
    adminSessionApi.requireAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.deleteAdminMessage(req, res),
);

router.get(
    '/api/admin/messages/bans',
    adminMessagesReadLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.getAdminBans(req, res),
);

router.post(
    '/api/admin/messages/ban',
    adminMessagesBanLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.addAdminBan(req, res),
);

router.post(
    '/api/admin/messages/unban',
    adminMessagesBanLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.removeAdminBan(req, res),
);

router.post(
    '/api/admin/messages/appeal/resolve',
    adminMessagesBanLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.resolveAdminAppeal(req, res),
);

router.patch(
    '/api/admin/messages/:id/assign',
    adminMessagesWriteLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.handleAssignMessage(req, res),
);

router.patch(
    '/api/admin/messages/:id/done',
    adminMessagesWriteLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.handleMarkMessageDone(req, res),
);

router.get(
    '/api/admin/users/names',
    adminUsersReadLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.listUsernames(req, res),
);

// Public WCA data endpoint.
router.get('/api/wca/:wcaId/:event', wcaLimiter, (req, res) => wcaApi.handleRequest(req, res));

// Public version endpoint for frontend/client diagnostics.
router.get('/api/version', (req, res) => {
    res.json({ version: packageJson.version });
});

module.exports = router;
module.exports.__internals = {
    createRateLimiter,
    sha256Hash,
    WcaApi,
    StatusApi,
    AdminSessionApi,
    ContactApi,
};
