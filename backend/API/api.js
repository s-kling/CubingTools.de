import express from 'express';
import { createRateLimiter } from '../lib/ratelimit.js';
import { WorkerPool } from '../lib/workerpool.js';
import { WcaStore } from '../wca/store.js';
import { loadConfig } from '../lib/config.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

import { randomScrambleForEvent } from 'cubing/scramble';

const router = express.Router();

import { db } from '../firebase.js';
const packageJson = JSON.parse(
    fs.readFileSync(
        path.join(path.dirname(new URL(import.meta.url).pathname), '../../package.json'),
        'utf8',
    ),
);

import { RecaptchaEnterpriseServiceClient } from '@google-cloud/recaptcha-enterprise';


/*
const limier = createRateLimiter(
    time,
    maxRequests,
    'Too many requests, please try again later.',
    { skipSuccessfulRequests: true } // Optional: only count failed attempts for certain endpoints like login
)
*/

const contactLimiter = createRateLimiter(
    10 * 60 * 1000,
    3,
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

const competitionsLimiter = createRateLimiter(
    15 * 60 * 1000,
    120,
    'Too many competition requests, please try again later.',
);

const newsletterSubscribeLimiter = createRateLimiter(
    60 * 60 * 1000,
    5,
    'Too many subscription requests, please try again later.',
);

const analysisLimiter = createRateLimiter(
    15 * 60 * 1000,
    30,
    'Too many analysis requests, please try again later.',
);

// WCA API endpoint
import WcaApi from './API/wca.api.js';

// Status API endpoint
import StatusApi from './API/status.api.js';

// Session-backed admin auth + message moderation endpoints.
import AdminSessionApi from './API/admin.api.js';

// Handles contact submissions, confirmation flow, and moderation storage.
import ContactApi from './API/contact.api.js';

// Handles newsletter subscriptions, confirmations, and unsubscribes.
import NewsletterApi from './API/newsletter.api.js';

const config = loadConfig();
const wcaStore = new WcaStore();
// CPU/SQL-heavy WCA work (profile building, Monte-Carlo ranking) runs off the request thread.
const cpuPool = new WorkerPool(new URL('../wca/worker.js', import.meta.url), {
    size: config.cpu_pool_size,
    workerData: { dir: wcaStore.dir },
});
const wcaApi = new WcaApi({ store: wcaStore, pool: cpuPool });
const statusApi = new StatusApi();
const contactApi = new ContactApi(db);
const adminSessionApi = new AdminSessionApi(contactApi, db);
const newsletterApi = new NewsletterApi(db);

// =========================
// Public Endpoints
// =========================

// Newsletter subscription
router.post('/api/newsletter/subscribe', newsletterSubscribeLimiter, (req, res) =>
    newsletterApi.handleSubscribe(req, res),
);

// Contact form submission
router.post('/api/contact', contactLimiter, (req, res) => contactApi.handleRequest(req, res));

// Contact confirmation callback
router.get('/contact/confirm', (req, res) => contactApi.handleRequest(req, res));

// WCA data endpoint
router.get('/api/wca/countries', wcaLimiter, (req, res) => wcaApi.handleCountriesRequest(req, res));
router.get('/api/wca/averages', wcaLimiter, (req, res) => wcaApi.handleBatchAveragesRequest(req, res));
router.get('/api/wca/:wcaId/:event', wcaLimiter, (req, res) => wcaApi.handleRequest(req, res));

// Scramble generation endpoint
router.get('/api/scramble/:event', scrambleLimiter, async (req, res) => {
    const event = req.params.event;
    const puzzleKey = EVENT_TO_TNOODLE_PUZZLE[event];

    if (!puzzleKey) {
        return res.status(400).json({ error: 'Invalid event type.' });
    }

    const count = Math.min(Math.max(parseInt(req.query.count, 10) || 1, 1), 50);

    if (event === 'fto') {
        try {
            // For FTO, generate scrambles using the cubing.net library (one at a time,
            // capped, so a 50-scramble request cannot monopolise the worker).
            const scrambles = [];
            for (let i = 0; i < Math.min(count, 12); i++) scrambles.push(await randomScrambleForEvent(event));

            return res.json({
                event,
                scrambles: scrambles.map((s) => s.toString()),
            });
        } catch (err) {
            console.error('Scramble generation error:', err.message);
            res.status(500).json({ error: 'Failed to generate scramble.' });
        }
    } else {
        try {
            // For single-scramble requests, use the prefetch cache.
            if (count === 1) {
                const cached = scrambleCache[puzzleKey];

                if (cached?.pending && cached.promise) {
                    await cached.promise;
                }

                const ready = scrambleCache[puzzleKey];

                if (ready?.scrambles?.length > 0) {
                    // The prefetch stores a small batch; hand out exactly ONE scramble per
                    // request (it used to return the whole batch of 3 for count=1) and only
                    // refill once the batch is used up. shift() is synchronous, so two
                    // concurrent requests can never receive the same scramble.
                    const scrambles = [ready.scrambles.shift()];
                    if (ready.scrambles.length === 0) {
                        delete scrambleCache[puzzleKey];
                        prefetchScramble(puzzleKey);
                    }
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
    }
});

// Version endpoint for frontend/client diagnostics
router.get('/api/version', (req, res) => {
    res.json({ version: packageJson.version });
});

// Competition listing
// GET /api/competitions?start=YYYY-MM-DD&end=YYYY-MM-DD&country=DE&q=Berlin
router.get('/api/competitions', competitionsLimiter, (req, res) =>
    wcaApi.handleCompetitionsRequest(req, res),
);

// Competition overview — events, rounds, competitor list, live flag
// GET /api/competitions/:id/overview
router.get('/api/competitions/:id/overview', competitionsLimiter, (req, res) =>
    wcaApi.handleCompetitionOverviewRequest(req, res),
);

// Live results from WCA Live (only useful for ongoing competitions)
// GET /api/competitions/:id/live
router.get('/api/competitions/:id/live', competitionsLimiter, (req, res) =>
    wcaApi.handleLiveResultsRequest(req, res),
);

// Streaming NDJSON round analysis
// GET /api/competitions/:id/analyze/:eventId/:roundId/stream
router.get('/api/competitions/:id/analyze/:eventId/:roundId/stream', analysisLimiter, (req, res) =>
    wcaApi.handleStreamingAnalysisRequest(req, res),
);

// =========================
// Admin Authentication
// =========================

// Login
router.post('/api/admin/login', adminLoginLimiter, (req, res) =>
    adminSessionApi.handleLogin(req, res),
);

// Verify session
router.get('/api/admin/verify', adminVerifyLimiter, (req, res) =>
    adminSessionApi.handleVerify(req, res),
);

// Combined admin overview payload used by the dashboard and message pages.
router.get(
    '/api/admin/overview',
    adminVerifyLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.getAdminOverview(req, res),
);

// Change password (any authenticated user)
router.post('/api/admin/change-password', adminChangePasswordLimiter, (req, res) =>
    adminSessionApi.handleChangePassword(req, res),
);

// Redownload WCA export
router.post(
    '/api/admin/update',
    adminVerifyLimiter,
    (req, res, next) => adminSessionApi.requireAdmin(req, res, next),
    (req, res) => wcaApi.handleForceRefreshRequest(req, res),
);

// Cancel an in-progress export refresh
router.post(
    '/api/admin/update/cancel',
    adminVerifyLimiter,
    (req, res, next) => adminSessionApi.requireAdmin(req, res, next),
    (req, res) => wcaApi.handleCancelRefreshRequest(req, res),
);

// WCA export metadata (any authenticated admin user)
router.get(
    '/api/admin/wca-metadata',
    adminVerifyLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => wcaApi.handleMetadataRequest(req, res),
);

// =========================
// User Management (Admin/Operator)
// =========================

// List users
router.get(
    '/api/admin/users',
    adminUsersReadLimiter,
    adminSessionApi.requireOperatorOrAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.listUsers(req, res),
);

// Add user
router.post(
    '/api/admin/users',
    adminUsersWriteLimiter,
    adminSessionApi.requireAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.addUser(req, res),
);

// Delete user
router.delete(
    '/api/admin/users/:username',
    adminUsersWriteLimiter,
    adminSessionApi.requireAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.deleteUser(req, res),
);

// Update user role
router.patch(
    '/api/admin/users/:username/role',
    adminUsersWriteLimiter,
    adminSessionApi.requireAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.updateUserRole(req, res),
);

// Update user display role
router.patch(
    '/api/admin/users/:username/display-role',
    adminUsersWriteLimiter,
    adminSessionApi.requireAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.updateUserDisplayRole(req, res),
);

// Update user display name
router.patch(
    '/api/admin/users/:username/name',
    adminUsersWriteLimiter,
    adminSessionApi.requireAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.updateUserName(req, res),
);

// Reset user password
router.post(
    '/api/admin/users/:username/reset-password',
    adminUsersWriteLimiter,
    adminSessionApi.requireAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.resetUserPassword(req, res),
);

// Update own color
router.patch(
    '/api/admin/users/me/color',
    adminUsersWriteLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.updateUserColor(req, res),
);

// Update any user's color
router.patch(
    '/api/admin/users/:username/color',
    adminUsersWriteLimiter,
    adminSessionApi.requireAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.updateAnyUserColor(req, res),
);

// List usernames (for assignment dropdowns)
router.get(
    '/api/admin/users/names',
    adminUsersReadLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.listUsernames(req, res),
);

// =========================
// Admin Status & Config
// =========================

// Status endpoint
router.post(
    '/api/admin/status',
    adminStatusLimiter,
    (req, res, next) => adminSessionApi.requireAuth(req, res, next),
    (req, res) => statusApi.handleRequest(req, res),
);

// Error rate threshold config (get)
const configPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'config.json');
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

// Error rate threshold config (patch)
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

// =========================
// Management TODO
// =========================

// Read ToDo
router.get(
    '/api/admin/todos',
    adminTodosReadLimiter,
    (req, res, next) => adminSessionApi.requireAuth(req, res, next),
    async (req, res) => {
        try {
            const doc = await db.collection('meta').doc('todo').get();
            if (!doc.exists) {
                return res.status(404).json({ error: 'TODO not found' });
            }
            const data = doc.data();
            return res.json({ content: data.content || '' });
        } catch (err) {
            return res.status(500).json({ error: 'Failed to load TODO' });
        }
    },
);

// Write TODO
router.post(
    '/api/admin/todos',
    adminTodosWriteLimiter,
    (req, res, next) => adminSessionApi.requireAuth(req, res, next),
    async (req, res) => {
        const { content } = req.body || {};
        if (typeof content !== 'string') {
            return res.status(400).json({ error: 'Invalid todo content' });
        }
        try {
            await db.collection('meta').doc('todo').set({ content });
            return res.json({ success: true });
        } catch {
            return res.status(500).json({ error: 'Failed to update TODO' });
        }
    },
);

// =========================
// Moderation & Ban Management
// =========================

// Get admin messages
router.get(
    '/api/admin/messages',
    adminMessagesReadLimiter,
    adminSessionApi.requireOperatorOrAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.getAdminMessages(req, res),
);

// Delete admin message
router.delete(
    '/api/admin/messages/:id',
    adminMessagesWriteLimiter,
    adminSessionApi.requireAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.deleteAdminMessage(req, res),
);

// Get bans
router.get(
    '/api/admin/messages/bans',
    adminMessagesReadLimiter,
    adminSessionApi.requireOperatorOrAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.getAdminBans(req, res),
);

// Add ban
router.post(
    '/api/admin/messages/ban',
    adminMessagesBanLimiter,
    adminSessionApi.requireOperatorOrAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.addAdminBan(req, res),
);

// Remove ban
router.post(
    '/api/admin/messages/unban',
    adminMessagesBanLimiter,
    adminSessionApi.requireOperatorOrAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.removeAdminBan(req, res),
);

// Resolve appeal
router.post(
    '/api/admin/messages/appeal/resolve',
    adminMessagesBanLimiter,
    adminSessionApi.requireOperatorOrAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.resolveAdminAppeal(req, res),
);

// Assign message
router.patch(
    '/api/admin/messages/:id/assign',
    adminMessagesWriteLimiter,
    adminSessionApi.requireOperatorOrAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.handleAssignMessage(req, res),
);

// Mark message done
router.patch(
    '/api/admin/messages/:id/done',
    adminMessagesWriteLimiter,
    adminSessionApi.requireOperatorOrAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.handleMarkMessageDone(req, res),
);

// Reply to a message
router.post(
    '/api/admin/messages/:id/reply',
    adminMessagesWriteLimiter,
    adminSessionApi.requireOperatorOrAdmin.bind(adminSessionApi),
    (req, res) => adminSessionApi.handleReplyMessage(req, res),
);

// =========================
// Task Management
// =========================

// Get tasks
router.get(
    '/api/admin/tasks',
    adminTodosReadLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.handleGetTasks(req, res),
);

// Get task completions
router.get(
    '/api/admin/tasks/completions',
    adminTodosReadLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.handleGetTaskCompletions(req, res),
);

// Mark task as done
router.post(
    '/api/admin/tasks/:taskId/complete',
    adminTodosWriteLimiter,
    adminSessionApi.requireAuth.bind(adminSessionApi),
    (req, res) => adminSessionApi.handleMarkTaskDone(req, res),
);

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
    'fto': 'fto',
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

// Hard timeout so a hung TNoodle cannot pile up sockets.
const tnoodleHttp = axios.create({ timeout: 15_000 });

async function fetchScramblesFromTnoodle(puzzleKey, count) {
    return tnoodleHttp
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

export default router;
export { cpuPool, wcaStore };
export const __internals = {
    createRateLimiter,
    WcaApi,
    StatusApi,
    AdminSessionApi,
    ContactApi,
};
