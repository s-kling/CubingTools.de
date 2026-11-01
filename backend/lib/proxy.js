import http from 'http';

/**
 * Minimal streaming reverse proxy used by the web server to forward API calls to the
 * logic server. It never buffers bodies (NDJSON analysis streams pass straight
 * through) and protects page serving with three guards:
 *   - a cap on in-flight proxied requests (excess gets an immediate 503),
 *   - a connect/response timeout (504 instead of hanging sockets),
 *   - keep-alive pooling to the logic server.
 * Slow API calls therefore cost the web tier a socket, not an event-loop turn.
 */
export function createApiProxy({ target, maxInflight = 256, timeoutMs = 30_000 }) {
    const agent = new http.Agent({ keepAlive: true, maxSockets: maxInflight });
    let inflight = 0;
    const url = new URL(target);

    const handler = (req, res) => {
        if (inflight >= maxInflight) {
            res.setHeader('Retry-After', '2');
            return res.status(503).json({ error: 'Service busy, please retry shortly.' });
        }
        inflight++;
        let done = false;
        const finish = () => {
            if (!done) {
                done = true;
                inflight--;
            }
        };

        const headers = { ...req.headers };
        // req.ip is already the real client (the web tier trusts exactly one proxy hop). Send just
        // that, so the logic tier - which trusts one hop too - keys rate limits on the client and
        // not on the web server's loopback address.
        headers['x-forwarded-for'] = req.ip;
        headers['x-forwarded-host'] = req.headers.host || '';
        headers['x-forwarded-proto'] = headers['x-forwarded-proto'] || req.protocol || 'http';

        const upstream = http.request(
            {
                agent,
                host: url.hostname,
                port: url.port,
                method: req.method,
                path: req.originalUrl,
                headers,
                timeout: timeoutMs,
            },
            (up) => {
                // Streaming responses (NDJSON) may legitimately outlive the response-header
                // timeout, so only guard the time-to-first-byte here.
                upstream.setTimeout(0);
                res.writeHead(up.statusCode || 502, up.headers);
                up.pipe(res);
                up.on('end', finish);
                up.on('error', finish);
            },
        );

        upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')));
        upstream.on('error', (err) => {
            finish();
            if (res.headersSent) return res.destroy();
            const timedOut = /timeout/.test(err.message);
            res.status(timedOut ? 504 : 502).json({
                error: timedOut ? 'The API took too long to respond.' : 'The API is temporarily unavailable.',
            });
        });
        res.on('close', () => {
            finish();
            upstream.destroy();
        });

        req.pipe(upstream);
    };
    handler.stats = () => ({ inflight });
    return handler;
}
