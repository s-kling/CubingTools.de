const express = require('express');
const path = require('path');
const router = express.Router();
const fs = require('fs');
const events = require('../events');

router.use((req, res, next) => {
    try {
        decodeURIComponent(req.path);
        next();
    } catch (err) {
        console.error('Bad URL detected:', req.url);
        res.status(400).send('Bad Request');
    }
});

// Serve the main page
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public/html', 'index.html'));
});

// Serve the status report
router.get('/status', (req, res) => {
    const logFilePath = path.join(__dirname, '..', 'log', 'server.log');

    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    const logFileSize = fs.existsSync(logFilePath) ? fs.statSync(logFilePath).size : 0;

    const statusLog = `
        Status Update:
        - Uptime: ${Math.floor(uptime / 60)} minutes
        - Memory Usage: RSS ${Math.round(memoryUsage.rss / 1024 / 1024)} MB, 
                        Heap Total ${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB, 
                        Heap Used ${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB
        - Log File Size: ${Math.round(logFileSize / 1024)} KB
    `;
    console.log(statusLog);

    const statusReport = {
        uptime: `${Math.floor(uptime / 60)} minutes`,
        memoryUsage: {
            rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
            heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
            heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
        },
        logFileSize: `${Math.round(logFileSize / 1024)} KB`,
    };
    res.json(statusReport);
});

// Serve the events
router.get('/events', (req, res) => {
    res.json({ events: events });
});

// Serve the main page
router.get('/privacy-policy', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public/html', 'privacy.html'));
});

// Serve the robots txt
router.get('/robots.txt', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public', 'robots.txt'));
});

// Serve the 404 page
router.get('/404', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public/html', '404.html'));
});

// Serve the apple-touch-icon.png
router.get('/apple-touch-icon.png', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public/assets', 'logo_with_text.png'));
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
    const filePath = path.join(__dirname, `../../public/html/tools`, toolName, `${toolName}.html`);

    res.sendFile(filePath, (err) => {
        if (err) {
            // Extract the directory from the requested path
            const requestedPath = req.path;

            // Find the directory from the requested path (first segment of the path after '/')
            const pathSegments = requestedPath.split('/').filter(Boolean); // Filter out empty strings

            // Redirect to the 404 page with the directory as a query parameter
            res.status(404);
            res.redirect(`/404?dir=${pathSegments.join('/')}`);
        }
    });
});

// Serve specific tool CSS files
router.get('/css/:cssName', (req, res) => {
    const cssName = req.params.cssName;
    const cssFile = path.join(__dirname, `../../public/html/tools`, cssName, `${cssName}.css`);

    res.sendFile(cssFile, (err) => {
        if (err) {
            // Extract the directory from the requested path
            const requestedPath = req.path;

            // Find the directory from the requested path (first segment of the path after '/')
            const pathSegments = requestedPath.split('/').filter(Boolean); // Filter out empty strings

            // Redirect to the 404 page with the directory as a query parameter
            res.status(404);
            res.redirect(`/404?dir=${pathSegments.join('/')}`);
        }
    });
});

router.get('/js/:jsName', (req, res) => {
    const jsName = req.params.jsName;
    const jsFile = path.join(__dirname, `../../public/html/tools`, jsName, `${jsName}.js`);

    res.sendFile(jsFile, (err) => {
        if (err) {
            console.error(`Error serving JS file: ${err}`);
            // Extract the directory from the requested path
            const requestedPath = req.path;

            // Find the directory from the requested path (first segment of the path after '/')
            const pathSegments = requestedPath.split('/').filter(Boolean); // Filter out empty strings

            // Redirect to the 404 page with the directory as a query parameter
            res.status(404);
            res.redirect(`/404?dir=${pathSegments.join('/')}`);
        }
    });
});

router.get('/assets/:assetName', (req, res) => {
    const assetName = req.params.assetName;
    const assetFile = path.join(__dirname, `../../public/html/tools`, assetName, `${assetName}`);

    res.sendFile(assetFile, (err) => {
        if (err) {
            // Extract the directory from the requested path
            const requestedPath = req.path;

            // Find the directory from the requested path (first segment of the path after '/')
            const pathSegments = requestedPath.split('/').filter(Boolean); // Filter out empty strings

            // Redirect to the 404 page with the directory as a query parameter
            res.status(404);
            res.redirect(`/404?dir=${pathSegments.join('/')}`);
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
