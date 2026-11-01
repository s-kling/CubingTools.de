const defaultWhitelist = [
    'https://cubingtools.de',
    'https://beta.cubingtools.de',
    'http://localhost:8000',
    'http://localhost:8001',
    'http://localhost:8002',
];

/** Origin allow-list shared by the web and logic servers (either may be hit directly). */
export function corsMiddleware() {
    const whitelist = new Set(
        (process.env.CORS_WHITELIST || defaultWhitelist.join(','))
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean),
    );
    return (req, res, next) => {
        const origin = req.headers.origin;
        if (!origin) return next(); // same-origin navigation / server-to-server
        if (whitelist.has(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            return req.method === 'OPTIONS' ? res.sendStatus(204) : next();
        }
        // Browsers attach Origin to same-origin POSTs as well; those must keep working on any
        // hostname that serves the site (e.g. www.), only genuinely cross-origin use is refused.
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        if (host && (origin === `https://${host}` || origin === `http://${host}`)) return next();
        return req.method === 'OPTIONS'
            ? res.sendStatus(403)
            : res.status(403).json({ error: 'Origin not allowed by CORS policy' });
    };
}
