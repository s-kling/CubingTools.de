import fs from 'fs';
import path from 'path';

export default class StatusApi {
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
        const __dirname = path.dirname(new URL(import.meta.url).pathname);
        const logPath = path.join(__dirname, '../../log', betaTest ? 'beta.log' : 'server.log');

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
            const __dirname = path.dirname(new URL(import.meta.url).pathname);
            const logPath = path.join(
                __dirname,
                '..',
                '..',
                'log',
                betaTest ? 'beta.log' : 'server.log',
            );
            const logFileSize = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
            // Return size in kilo Bytes with 2 decimal places
            return (logFileSize / 1024).toFixed(2);
        } catch {
            return '0.00';
        }
    }
}
