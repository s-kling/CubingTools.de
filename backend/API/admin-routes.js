const express = require('express');
const path = require('path');
const router = express.Router();

// Serve the admin page
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

module.exports = router;
