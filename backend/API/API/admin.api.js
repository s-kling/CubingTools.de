import bcrypt from 'bcrypt';
import crypto from 'crypto';

const BCRYPT_ROUNDS = 12;

export default class AdminSessionApi {
    constructor(contactApi, _db) {
        // In-memory token -> { expiry, username, role } map.
        this.sessions = new Map();
        this.SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
        this.contactApi = contactApi;
        this.db = _db;
    }

    // Load all users from the Firestore 'users' collection.
    async _loadUsers() {
        const snapshot = await this.db.collection('users').get();
        return snapshot.docs.map((doc) => doc.data());
    }

    // Update (or create) a single user document in Firestore.
    async _saveUser(username, data) {
        const docId = username.toLowerCase();
        await this.db.collection('users').doc(docId).set(data, { merge: true });
    }

    // Delete a single user document from Firestore.
    async _deleteUserDoc(username) {
        const docId = username.toLowerCase();
        await this.db.collection('users').doc(docId).delete();
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

        const messages = await this.contactApi.getMessages();
        const message = messages.find((m) => m.id === id);
        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        if (role !== 'admin' && message.assignedTo !== username) {
            return res.status(403).json({ error: 'Not authorized to mark this message done' });
        }

        const updated = await this.contactApi.markMessageDone(id, isDone);
        if (!updated) {
            return res.status(404).json({ error: 'Message not found' });
        }

        return res.json({ success: true });
    }

    // Return moderation data for admin UI.
    async getAdminMessages(req, res) {
        const messages = await this.contactApi.getMessages();
        const bans = this.contactApi.getBans();
        return res.json({ messages, bans });
    }

    // Delete one queued/confirmed message by ID.
    async deleteAdminMessage(req, res) {
        const id = String(req?.params?.id || '').trim();
        if (!id) {
            return res.status(400).json({ error: 'Message id required' });
        }

        const removed = await this.contactApi.removeMessage(id);
        if (!removed) {
            return res.status(404).json({ error: 'Message not found' });
        }

        return res.json({ success: true });
    }

    // Return only ban-list payload.
    getAdminBans(req, res) {
        return res.json({ bans: this.contactApi.getBans() });
    }

    // Add a new ban entry.
    addAdminBan(req, res) {
        const { type, value, reason } = req.body || {};
        const session = this.verifyToken(this.extractToken(req));
        const user = session?.username || 'unknown';
        const added = this.contactApi.addBan({ type, value, user, reason });

        if (!added) {
            return res.status(400).json({ error: 'Invalid ban payload' });
        }

        return res.json({ success: true, bans: this.contactApi.getBans() });
    }

    // Remove an existing ban entry.
    removeAdminBan(req, res) {
        const { type, value } = req.body || {};
        const removed = this.contactApi.removeBan({ type, value });

        if (!removed) {
            return res.status(404).json({ error: 'Ban entry not found' });
        }

        return res.json({ success: true, bans: this.contactApi.getBans() });
    }

    // Resolve pending appeals; optionally unban.
    resolveAdminAppeal(req, res) {
        const { type, value, unban, reason } = req.body || {};
        const unbanRequested = Boolean(unban);
        const resolutionReason = String(reason || '').trim();
        const resolved = this.contactApi.resolveAppeal({
            type,
            value,
            unban: unbanRequested,
            reason: resolutionReason,
        });

        if (!resolved?.success) {
            return res.status(404).json({ error: 'Appeal entry not found' });
        }

        this.contactApi
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

        return res.json({ success: true, bans: this.contactApi.getBans() });
    }

    // Read per-task completion history from Firestore.
    async _loadTaskCompletions() {
        const snapshot = await this.db.collection('taskCompletions').get();
        const completions = {};
        for (const doc of snapshot.docs) {
            completions[doc.id] = doc.data().entries || [];
        }
        return completions;
    }

    // Persist a single task's completion entries to Firestore.
    async _saveTaskCompletion(taskId, entries) {
        await this.db.collection('taskCompletions').doc(taskId).set({ entries });
    }

    // Evaluate whether a task's data condition is currently satisfied.
    async _evaluateCondition(condition) {
        if (!condition) return true;
        const messages = await this.contactApi.getMessages();
        const confirmedMessages = messages.filter((m) => m.confirmed);
        switch (condition) {
            case 'hasPendingMessages':
                return confirmedMessages.some((m) => m.status !== 'done');
            case 'hasMessages':
                return confirmedMessages.length > 0;
            case 'hasBans': {
                const bans = this.contactApi.getBans();
                return bans.emails.length > 0 || bans.ips.length > 0;
            }
            default:
                return true;
        }
    }

    // Return task definitions from Firestore, enriched with live applicability.
    async handleGetTasks(req, res) {
        try {
            const snapshot = await this.db.collection('tasks').get();
            const tasks = snapshot.docs.map((doc) => doc.data());
            const enriched = await Promise.all(
                tasks.map(async (task) => ({
                    ...task,
                    applicable: await this._evaluateCondition(task.condition),
                })),
            );
            return res.json({ tasks: enriched });
        } catch (err) {
            console.error('Failed to load tasks:', err);
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
