const express = require('express');
const path = require('path');
const router = express.Router();

// Serve the main page
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public/html', 'index.html'));
});

// Serve the main page
router.get('/robots.txt', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public', 'robots.txt'));
});

// Serve the 404 page
router.get('/404', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public/html', '404.html'));
});

// Serve the apple-touch-icon.png
router.get('/apple-touch-icon.png', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public/assets', 'apple-touch-icon.png'));
});

// Serve the sitemap
router.get('/sitemap.xml', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public', 'sitemap.xml'));
});

// Serve the google.html
router.get('/googlea20166777fc211f6.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public/html', 'google.html'));
});

// Serve specific tool pages
router.get('/tools/:toolName', (req, res) => {
    const toolName = req.params.toolName;
    const filePath = path.join(__dirname, `../../public/html/tools`, `${toolName}.html`);

    res.sendFile(filePath, (err) => {
        if (err) {
            // Extract the directory from the requested path
            const requestedPath = req.path;

            // Find the directory from the requested path (first segment of the path after '/')
            const pathSegments = requestedPath.split('/').filter(Boolean); // Filter out empty strings
            const directory = pathSegments.length > 0 ? pathSegments[0] : '';

            // Redirect to the 404 page with the directory as a query parameter
            res.redirect(`/404?dir=${pathSegments.join('/')}`);
            res.status(404);
        }
    });
});

// Catch-all route for non-existing paths
router.get('*', (req, res) => {
    // Extract the directory from the requested path
    const requestedPath = req.path;

    // Find the directory from the requested path (first segment of the path after '/')
    const pathSegments = requestedPath.split('/').filter(Boolean); // Filter out empty strings

    // Redirect to the 404 page with the directory as a query parameter
    res.redirect(`/404?dir=${pathSegments.join('/')}`);
    res.status(404);
});

module.exports = router;
