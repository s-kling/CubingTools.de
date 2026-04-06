const express = require('express');
const path = require('path');
const router = express.Router();
const events = require('../events');

// Allowlist: tool/asset names may only contain alphanumeric chars, hyphens, and underscores.
const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

// Resolve a path and confirm it stays inside the expected base directory.
function resolvePathSafe(base, ...segments) {
    const resolvedBase = path.resolve(base);
    const resolvedTarget = path.resolve(base, ...segments);
    // Must start with base + separator to prevent base-prefix spoofing.
    if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
        return null;
    }
    return resolvedTarget;
}

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

// Serve the events
router.get('/events', (req, res) => {
    res.json({ events: events });
});

// Serve the main page
router.get('/privacy-policy', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public/html', 'privacy.html'));
});

// Serve the contact page
router.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public/html', 'contact.html'));
});

// Serve the ban appeal page
router.get('/contact/appeal', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '../public/html', 'contact.html'));
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

// Serve the apple-touch-icon.png
router.get('/apple-touch-icon-precomposed.png', (req, res) => {
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

router.get('/.well-known/*', (req, res) => {
    res.status(204).end();
});

// Serve specific tool pages
router.get('/tools/:toolName', (req, res) => {
    const toolName = req.params.toolName;

    if (!SAFE_NAME_RE.test(toolName)) {
        return res.status(400).send('Bad Request');
    }

    const toolsBase = path.resolve(__dirname, '../../public/tools');
    const filePath = resolvePathSafe(toolsBase, toolName, `${toolName}.html`);

    if (!filePath) {
        return res.status(400).send('Bad Request');
    }

    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(404);
            res.redirect(`/404?dir=${encodeURIComponent(toolName)}`);
        }
    });
});

// Serve specific tool CSS files
router.get('/css/:cssName', (req, res) => {
    const cssName = req.params.cssName;

    if (!SAFE_NAME_RE.test(cssName)) {
        return res.status(400).send('Bad Request');
    }

    const toolsBase = path.resolve(__dirname, '../../public/tools');
    const cssFile = resolvePathSafe(toolsBase, cssName, `${cssName}.css`);

    if (!cssFile) {
        return res.status(400).send('Bad Request');
    }

    res.sendFile(cssFile, (err) => {
        if (err) {
            res.status(404);
            res.redirect(`/404?dir=${encodeURIComponent(cssName)}`);
        }
    });
});

router.get('/js/:jsName', (req, res) => {
    const jsName = req.params.jsName;

    if (!SAFE_NAME_RE.test(jsName)) {
        return res.status(400).send('Bad Request');
    }

    const toolsBase = path.resolve(__dirname, '../../public/tools');
    const jsFile = resolvePathSafe(toolsBase, jsName, `${jsName}.js`);

    if (!jsFile) {
        return res.status(400).send('Bad Request');
    }

    res.sendFile(jsFile, (err) => {
        if (err) {
            console.error(`Error serving JS file: ${err}`);
            res.status(404);
            res.redirect(`/404?dir=${encodeURIComponent(jsName)}`);
        }
    });
});

router.get('/assets/:assetName', (req, res) => {
    const assetName = req.params.assetName;

    if (!SAFE_NAME_RE.test(assetName)) {
        return res.status(400).send('Bad Request');
    }

    const toolsBase = path.resolve(__dirname, '../../public/tools');
    const assetFile = resolvePathSafe(toolsBase, assetName, assetName);

    if (!assetFile) {
        return res.status(400).send('Bad Request');
    }

    res.sendFile(assetFile, (err) => {
        if (err) {
            res.status(404);
            res.redirect(`/404?dir=${encodeURIComponent(assetName)}`);
        }
    });
});

// Catch-all route for non-existing paths
router.get('*', (req, res) => {
    // Serve the 404 page with the directory as a query parameter
    res.status(404);
    res.sendFile(path.join(__dirname, '..', '../public/html', '404.html'), (err) => {});
});

module.exports = router;
