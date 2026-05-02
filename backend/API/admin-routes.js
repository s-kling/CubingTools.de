import express from 'express';
import path from 'path';
const router = express.Router();

// Serve the admin page
const __dirname = path.dirname(new URL(import.meta.url).pathname);
router.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public/html/admin', 'admin.html'));
});

// Serve the status report
router.get('/admin/status', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public/html/admin', 'status.html'));
});

// Serve the messages report
router.get('/admin/messages', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public/html/admin', 'messages.html'));
});

// Serve the dev todo page
router.get('/admin/dev-todo', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public/html/admin', 'dev-todo.html'));
});

// Serve the user management page
router.get('/admin/users', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public/html/admin', 'users.html'));
});

export default router;
