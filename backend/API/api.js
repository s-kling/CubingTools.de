const axios = require('axios');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const { db } = require('../firebase');
const packageJson = require('../../package.json');

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

const scrambleLimiter = createRateLimiter(
    15 * 60 * 1000,
    300,
    'Too many scramble requests, please try again later.',
);

// Encapsulates WCA profile fetch + result aggregation helpers used by the public API.
// Uses the official WCA API v0 (https://www.worldcubeassociation.org/api/v0/).
class WcaApi {
    constructor() {
        this.baseUrl = 'https://www.worldcubeassociation.org/api/v0/persons';
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

    // Strip padding zeros from an attempts array (unused slots in bo3/bo1 formats).
    filterAttempts(attempts) {
        return attempts.filter((a) => a !== 0);
    }

    // Fetch competitor data with de-duplication for in-flight requests.
    // Combines person info and results from two official WCA API endpoints.
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

        const requestPromise = Promise.all([
            axios.get(`${this.baseUrl}/${cacheKey}`),
            axios.get(`${this.baseUrl}/${cacheKey}/results`),
        ])
            .then(([personResponse, resultsResponse]) => {
                const data = {
                    name: personResponse.data.person.name,
                    personalRecords: personResponse.data.personal_records || {},
                    results: Array.isArray(resultsResponse.data) ? resultsResponse.data : [],
                };
                this.responseCache.set(cacheKey, {
                    data,
                    expiresAt: Date.now() + this.cacheTtlMs,
                });
                return data;
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

    // Filter results for a specific event from the flat results array.
    getAllResultsForEvent(data, event) {
        return data.results.filter((r) => r.event_id === event);
    }

    // Build a latest-solves list, keeping only valid solves.
    // Results arrive oldest-first from the API, so reverse to get newest first.
    getSolves(allResults, solvecount) {
        const reversed = [...allResults].reverse();
        let solves = reversed.flatMap((result) =>
            this.filterAttempts([...result.attempts].reverse()),
        );
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
        return sum / solves.length / 100; // convert centiseconds → seconds
    }

    // Return all average values for an event timeline.
    getAverages(allResults) {
        return allResults.flatMap((result) => result.average);
    }

    // Pull current PRs from the personal_records section.
    getPersonalRecords(data, event) {
        const eventRecords = data.personalRecords[event];
        return {
            single: eventRecords?.single?.best || null,
            average: eventRecords?.average?.best || null,
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
                const reversed = [...allResults].reverse();
                return res.json({
                    allResults: reversed.flatMap((result) =>
                        this.filterAttempts([...result.attempts].reverse()),
                    ),
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
            utmSources: {},
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
                utmSource: entry.utmSource || null,
            });

            stats.totalRequests++;

            // HTTP methods
            stats.methods[entry.method] = (stats.methods[entry.method] || 0) + 1;

            // Endpoints
            stats.endpoints[entry.url] = (stats.endpoints[entry.url] || 0) + 1;

            // Status codes
            stats.statusCodes[entry.status] = (stats.statusCodes[entry.status] || 0) + 1;

            // Count error but exclude 404 spam
            if (entry.status >= 400 && entry.status !== 404) totalErrors++;

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

            // UTM sources
            if (entry.utmSource) {
                stats.utmSources[entry.utmSource] = (stats.utmSources[entry.utmSource] || 0) + 1;
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
        // In-memory token -> { expiry, username, role } map.
        this.sessions = new Map();
        this.SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
    }

    // Load all users from the Firestore 'users' collection.
    async _loadUsers() {
        const snapshot = await db.collection('users').get();
        return snapshot.docs.map((doc) => doc.data());
    }

    // Update (or create) a single user document in Firestore.
    async _saveUser(username, data) {
        const docId = username.toLowerCase();
        await db.collection('users').doc(docId).set(data, { merge: true });
    }

    // Delete a single user document from Firestore.
    async _deleteUserDoc(username) {
        const docId = username.toLowerCase();
        await db.collection('users').doc(docId).delete();
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
        const users = await this._loadUsers();
        const user = users.find((u) => u.username.toLowerCase() === normalizedUsername);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        let isValid = false;
        try {
            isValid = await bcrypt.compare(password, user.password);
        } catch {
            isValid = false;
        }

        if (!isValid) return res.status(401).json({ error: 'Unauthorized' });

        user.lastLogin = new Date().toISOString();
        await this._saveUser(user.username, user);

        const token = this.createSession(user.username, user.role);
        return res.json({
            token,
            role: user.role,
            requiresPasswordChange: Boolean(user.firstLogin),
        });
    }

    // Stateless endpoint to verify token validity.
    async handleVerify(req, res) {
        const token = this.extractToken(req);
        const session = this.verifyToken(token);
        if (!session) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const users = await this._loadUsers();
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
    async updateUserColor(req, res) {
        const token = this.extractToken(req);
        const session = this.verifyToken(token);
        if (!session) return res.status(401).json({ error: 'Unauthorized' });

        const { color } = req.body || {};
        if (!color || typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
            return res.status(400).json({ error: 'Invalid color. Must be a 6-digit hex color.' });
        }

        const users = await this._loadUsers();
        const user = users.find((u) => u.username === session.username);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.color = color;
        await this._saveUser(user.username, user);
        return res.json({ success: true, color });
    }

    // Update any user's display color (admin only).
    async updateAnyUserColor(req, res) {
        const { username } = req.params;
        if (!username || typeof username !== 'string') {
            return res.status(400).json({ error: 'Username is required' });
        }

        const { color } = req.body || {};
        if (!color || typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
            return res.status(400).json({ error: 'Invalid color. Must be a 6-digit hex color.' });
        }

        const users = await this._loadUsers();
        const user = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.color = color;
        await this._saveUser(user.username, user);
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

    // Express middleware guard restricted to admin or operator roles (excludes tester).
    requireOperatorOrAdmin(req, res, next) {
        const token = this.extractToken(req);
        const session = this.verifyToken(token);
        if (!session) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (session.role !== 'admin' && session.role !== 'operator') {
            return res.status(403).json({ error: 'Forbidden: operator or admin access required' });
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

        const users = await this._loadUsers();
        const user = users.find((u) => u.username === session.username);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        user.firstLogin = false;
        await this._saveUser(user.username, user);

        return res.json({ success: true });
    }

    // Return list of users (passwords omitted) for admin UI.
    async listUsers(req, res) {
        const users = await this._loadUsers();
        const safe = users.map(({ password: _pw, ...rest }) => rest);
        return res.json({ users: safe });
    }

    // Return usernames and colors (any authenticated user, for assignment dropdowns).
    async listUsernames(req, res) {
        const users = await this._loadUsers();
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
        if (!['admin', 'operator', 'tester'].includes(normalizedRole)) {
            return res.status(400).json({ error: 'Role must be "admin", "operator", or "tester"' });
        }

        const users = await this._loadUsers();
        const exists = users.some(
            (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
        );
        if (exists) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        // Generate a random color for the user
        const randomColor = `#${crypto.randomBytes(3).toString('hex')}`;

        const defaultPasswordHash = await bcrypt.hash('cubingtools', BCRYPT_ROUNDS);
        const newUser = {
            username: username.trim(),
            password: defaultPasswordHash,
            role: normalizedRole,
            color: randomColor,
            firstLogin: true,
        };
        await this._saveUser(newUser.username, newUser);
        return res.status(201).json({ success: true });
    }

    // Delete a user by username (admin only, cannot delete self).
    async deleteUser(req, res) {
        const { username } = req.params;
        const session = this.verifyToken(this.extractToken(req));
        if (!username || typeof username !== 'string') {
            return res.status(400).json({ error: 'Username is required' });
        }
        if (session && session.username.toLowerCase() === username.trim().toLowerCase()) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        const users = await this._loadUsers();
        const user = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        await this._deleteUserDoc(user.username);
        // Invalidate any active sessions for the deleted user.
        for (const [token, s] of this.sessions) {
            if (s.username.toLowerCase() === username.trim().toLowerCase()) {
                this.sessions.delete(token);
            }
        }
        return res.json({ success: true });
    }

    // Update a user's role (admin only, cannot demote self).
    async updateUserRole(req, res) {
        const { username } = req.params;
        const { role } = req.body || {};
        const session = this.verifyToken(this.extractToken(req));

        if (!username || typeof username !== 'string') {
            return res.status(400).json({ error: 'Username is required' });
        }
        if (!['admin', 'operator', 'tester'].includes(role)) {
            return res.status(400).json({ error: 'Role must be "admin", "operator", or "tester"' });
        }
        if (session && session.username.toLowerCase() === username.trim().toLowerCase()) {
            return res.status(400).json({ error: 'Cannot change your own role' });
        }

        const users = await this._loadUsers();
        const user = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.role = role;
        await this._saveUser(user.username, user);
        return res.json({ success: true });
    }

    // Reset a user's password to the default and flag firstLogin (admin only).
    async resetUserPassword(req, res) {
        const { username } = req.params;
        if (!username || typeof username !== 'string') {
            return res.status(400).json({ error: 'Username is required' });
        }

        const users = await this._loadUsers();
        const user = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.password = await bcrypt.hash('cubingtools', BCRYPT_ROUNDS);
        user.firstLogin = true;
        await this._saveUser(user.username, user);
        return res.json({ success: true });
    }

    // Assign or unassign a message to a specific admin user.
    async handleAssignMessage(req, res) {
        const id = String(req?.params?.id || '').trim();
        if (!id) {
            return res.status(400).json({ error: 'Message id required' });
        }

        const { assignedTo } = req.body || {};
        const normalizedAssignee = String(assignedTo || '').trim() || null;

        if (normalizedAssignee) {
            const users = await this._loadUsers();
            const exists = users.some(
                (u) => u.username.toLowerCase() === normalizedAssignee.toLowerCase(),
            );
            if (!exists) {
                return res.status(404).json({ error: 'User not found' });
            }
        }

        const updated = await contactApi.assignMessage(id, normalizedAssignee);
        if (!updated) {
            return res.status(404).json({ error: 'Message not found' });
        }

        return res.json({ success: true });
    }

    // Mark or unmark a message as done (admin or assigned user only).
    async handleMarkMessageDone(req, res) {
        const id = String(req?.params?.id || '').trim();
        if (!id) {
            return res.status(400).json({ error: 'Message id required' });
        }

        const { done } = req.body || {};
        const isDone = Boolean(done);
        const { username, role } = req.adminUser;

        const messages = await contactApi.getMessages();
        const message = messages.find((m) => m.id === id);
        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        if (role !== 'admin' && message.assignedTo !== username) {
            return res.status(403).json({ error: 'Not authorized to mark this message done' });
        }

        const updated = await contactApi.markMessageDone(id, isDone);
        if (!updated) {
            return res.status(404).json({ error: 'Message not found' });
        }

        return res.json({ success: true });
    }

    // Return moderation data for admin UI.
    async getAdminMessages(req, res) {
        const messages = await contactApi.getMessages();
        const bans = contactApi.getBans();
        return res.json({ messages, bans });
    }

    // Delete one queued/confirmed message by ID.
    async deleteAdminMessage(req, res) {
        const id = String(req?.params?.id || '').trim();
        if (!id) {
            return res.status(400).json({ error: 'Message id required' });
        }

        const removed = await contactApi.removeMessage(id);
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

    // Read per-task completion history from Firestore.
    async _loadTaskCompletions() {
        const snapshot = await db.collection('taskCompletions').get();
        const completions = {};
        for (const doc of snapshot.docs) {
            completions[doc.id] = doc.data().entries || [];
        }
        return completions;
    }

    // Persist a single task's completion entries to Firestore.
    async _saveTaskCompletion(taskId, entries) {
        await db.collection('taskCompletions').doc(taskId).set({ entries });
    }

    // Evaluate whether a task's data condition is currently satisfied.
    async _evaluateCondition(condition) {
        if (!condition) return true;
        const messages = await contactApi.getMessages();
        const confirmedMessages = messages.filter((m) => m.confirmed);
        switch (condition) {
            case 'hasPendingMessages':
                return confirmedMessages.some((m) => m.status !== 'done');
            case 'hasMessages':
                return confirmedMessages.length > 0;
            case 'hasBans': {
                const bans = contactApi.getBans();
                return bans.emails.length > 0 || bans.ips.length > 0;
            }
            default:
                return true;
        }
    }

    // Return task definitions from Firestore, enriched with live applicability.
    async handleGetTasks(req, res) {
        try {
            const snapshot = await db.collection('tasks').get();
            const tasks = snapshot.docs.map((doc) => doc.data());
            const enriched = await Promise.all(
                tasks.map(async (task) => ({
                    ...task,
                    applicable: await this._evaluateCondition(task.condition),
                })),
            );
            return res.json({ tasks: enriched });
        } catch {
            return res.status(500).json({ error: 'Failed to load tasks.' });
        }
    }

    // Return all completion history for all tasks.
    async handleGetTaskCompletions(req, res) {
        const completions = await this._loadTaskCompletions();
        return res.json({ completions });
    }

    // Record a task completion for the authenticated user.
    async handleMarkTaskDone(req, res) {
        const taskId = String(req?.params?.taskId || '').trim();
        if (!taskId) return res.status(400).json({ error: 'Missing task ID.' });

        const { username } = req.adminUser;
        const completions = await this._loadTaskCompletions();
        if (!Array.isArray(completions[taskId])) completions[taskId] = [];
        completions[taskId].unshift({ username, completedAt: new Date().toISOString() });
        // Keep at most 100 entries per task to prevent unbounded growth.
        if (completions[taskId].length > 100)
            completions[taskId] = completions[taskId].slice(0, 100);
        await this._saveTaskCompletion(taskId, completions[taskId]);
        return res.json({ success: true });
    }
}

// Handles contact submissions, confirmation flow, and moderation storage.
class ContactApi {
    constructor() {
        this.password = process.env.CONTACT_API_PASSWORD || '';
        this.projectID = process.env.RECAPTCHA_PROJECT_ID || '';
        this.recaptchaKey = process.env.RECAPTCHA_SITE_KEY || '';
        this.recaptchaAction = process.env.RECAPTCHA_ACTION || '';
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

        await db.collection('messages').doc(id).set(doc);
    }

    // Read all messages from Firestore.
    async readMessages() {
        const snapshot = await db.collection('messages').get();
        return snapshot.docs.map((doc) => doc.data());
    }

    // Drop unconfirmed messages older than TTL from Firestore.
    async pruneExpiredUnconfirmedMails() {
        const cutoff = Date.now() - this.unconfirmedTtlMs;
        const snapshot = await db.collection('messages').where('confirmed', '==', false).get();

        const batch = db.batch();
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
    async validateConfirmationLink(id) {
        // Confirmation IDs are 32-character lowercase hex strings.
        if (!id || !/^[0-9a-f]{32}$/.test(String(id))) {
            return false;
        }

        await this.pruneExpiredUnconfirmedMails();

        const docRef = db.collection('messages').doc(id);
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
        const docRef = db.collection('messages').doc(String(id));
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

        const docRef = db.collection('messages').doc(id);
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

        const docRef = db.collection('messages').doc(id);
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
        const snapshot = await db.collection('messages').get();
        return snapshot.docs.map((doc) => doc.data());
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

// User management endpoints (read: admin + operator, write: admin only).
router.get(
    '/api/admin/users',
    adminUsersReadLimiter,
    adminSessionApi.requireOperatorOrAdmin.bind(adminSessionApi),
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

// Error rate threshold config endpoints.
const configPath = path.join(__dirname, '..', 'config.json');

router.get(
    '/api/admin/config/error-rate-threshold',
    adminStatusLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return res.json({ threshold: config.error_rate_threshold ?? 1 });
        } catch {
            return res.json({ threshold: 1 });
        }
    },
);

router.patch(
    '/api/admin/config/error-rate-threshold',
    adminStatusLimiter,
    adminSessionApi.requireAdmin.bind(adminSessionApi),
    (req, res) => {
        const { threshold } = req.body || {};
        if (typeof threshold !== 'number' || threshold < 0 || threshold > 25) {
            return res.status(400).json({ error: 'Threshold must be a number between 0 and 25.' });
        }
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            config.error_rate_threshold = threshold;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf8');
            return res.json({ success: true, threshold });
        } catch {
            return res.status(500).json({ error: 'Failed to update config.' });
        }
    },
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

// Protected moderation and ban-management endpoints (operator or admin only).
router.get(
    '/api/admin/messages',
    adminMessagesReadLimiter,
    adminSessionApi.requireOperatorOrAdmin.bind(adminSessionApi),
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
    adminSessionApi.requireOperatorOrAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.getAdminBans(req, res),
);

router.post(
    '/api/admin/messages/ban',
    adminMessagesBanLimiter,
    adminSessionApi.requireOperatorOrAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.addAdminBan(req, res),
);

router.post(
    '/api/admin/messages/unban',
    adminMessagesBanLimiter,
    adminSessionApi.requireOperatorOrAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.removeAdminBan(req, res),
);

router.post(
    '/api/admin/messages/appeal/resolve',
    adminMessagesBanLimiter,
    adminSessionApi.requireOperatorOrAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.resolveAdminAppeal(req, res),
);

router.patch(
    '/api/admin/messages/:id/assign',
    adminMessagesWriteLimiter,
    adminSessionApi.requireOperatorOrAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.handleAssignMessage(req, res),
);

router.patch(
    '/api/admin/messages/:id/done',
    adminMessagesWriteLimiter,
    adminSessionApi.requireOperatorOrAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.handleMarkMessageDone(req, res),
);

router.get(
    '/api/admin/users/names',
    adminUsersReadLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.listUsernames(req, res),
);

// Protected task definition endpoint.
router.get(
    '/api/admin/tasks',
    adminTodosReadLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.handleGetTasks(req, res),
);

// Protected task completion history endpoint.
router.get(
    '/api/admin/tasks/completions',
    adminTodosReadLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.handleGetTaskCompletions(req, res),
);

// Protected endpoint to record a task completion.
router.post(
    '/api/admin/tasks/:taskId/complete',
    adminTodosWriteLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.handleMarkTaskDone(req, res),
);

// Public WCA data endpoint.
router.get('/api/wca/:wcaId/:event', wcaLimiter, (req, res) => wcaApi.handleRequest(req, res));

// Public version endpoint for frontend/client diagnostics.
router.get('/api/version', (req, res) => {
    res.json({ version: packageJson.version });
});

// Mapping from WCA event IDs to TNoodle puzzle keys.
const EVENT_TO_TNOODLE_PUZZLE = {
    '222': '222',
    '333': '333',
    '444': '444',
    '555': '555',
    '666': '666',
    '777': '777',
    '333bf': '333ni',
    '333oh': '333',
    'clock': 'clock',
    'minx': 'minx',
    'pyram': 'pyram',
    'skewb': 'skewb',
    'sq1': 'sq1',
    '444bf': '444ni',
    '555bf': '555ni',
};

const TNOODLE_BASE_URL = process.env.TNOODLE_URL || 'http://localhost:2014';

// Prefetch cache: stores one scramble ahead per puzzle key so the next request is instant.
const scrambleCache = {};

async function fetchScramblesFromTnoodle(puzzleKey, count) {
    return axios
        .get(`${TNOODLE_BASE_URL}/api/v0/scramble/${puzzleKey}`, {
            params: { numScrambles: count },
        })
        .then((response) => (Array.isArray(response.data) ? response.data : []));
}

function prefetchScramble(puzzleKey) {
    const pending = fetchScramblesFromTnoodle(puzzleKey, 3)
        .then((scrambles) => {
            scrambleCache[puzzleKey] = { scrambles, pending: false };
        })
        .catch(() => {
            delete scrambleCache[puzzleKey];
        });
    scrambleCache[puzzleKey] = { scrambles: null, pending: true, promise: pending };
}

// Public scramble generation endpoint (uses TNoodle server with one-ahead prefetch).
router.get('/api/scramble/:event', scrambleLimiter, async (req, res) => {
    const event = req.params.event;
    const puzzleKey = EVENT_TO_TNOODLE_PUZZLE[event];

    if (!puzzleKey) {
        return res.status(400).json({ error: 'Invalid event type.' });
    }

    const count = Math.min(Math.max(parseInt(req.query.count, 10) || 1, 1), 50);

    try {
        // For single-scramble requests, use the prefetch cache.
        if (count === 1) {
            const cached = scrambleCache[puzzleKey];

            if (cached?.pending && cached.promise) {
                await cached.promise;
            }

            const ready = scrambleCache[puzzleKey];

            if (ready?.scrambles?.length > 0) {
                const scrambles = ready.scrambles;
                delete scrambleCache[puzzleKey];
                prefetchScramble(puzzleKey);
                return res.json({ event, scrambles });
            }

            // No cached scramble available — fetch directly, then prefetch next.
            const scrambles = await fetchScramblesFromTnoodle(puzzleKey, 1);
            prefetchScramble(puzzleKey);
            return res.json({ event, scrambles });
        }

        // Multi-scramble requests bypass the cache.
        const scrambles = await fetchScramblesFromTnoodle(puzzleKey, count);
        res.json({ event, scrambles });
    } catch (err) {
        console.error('Scramble generation error:', err.message);
        res.status(500).json({ error: 'Failed to generate scramble.' });
    }
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
