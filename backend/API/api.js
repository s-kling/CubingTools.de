const express = require('express');
const axios = require('axios');
const router = express.Router();
const path = require('path');
const packageJson = require('../../package.json');
const config = require('../config');
const crypto = require('crypto');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

class WcaApi {
    constructor() {
        this.baseUrl =
            'https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/master/api/persons';
    }

    async fetchCompetitorData(wcaId) {
        try {
            const response = await axios.get(`${this.baseUrl}/${wcaId}.json`);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to fetch data for ${wcaId}: ${error.message}`);
        }
    }

    getCompetitorName(data) {
        return { name: data.name };
    }

    getAllResultsForEvent(data, event) {
        let allResults = [];
        for (const competition of Object.values(data.results)) {
            if (competition[event]) {
                allResults = allResults.concat(competition[event]);
            }
        }
        return allResults;
    }

    getSolves(allResults, solvecount) {
        let solves = allResults.flatMap((result) => result.solves.reverse());
        solves = solves.filter((result) => result > 0).slice(0, solvecount);
        return solves;
    }

    calculateAverage(solves) {
        if (solves.length === 0) {
            return null;
        }
        solves.sort((a, b) => a - b);
        solves = solves.slice(1, -1); // drop fastest and slowest
        const sum = solves.reduce((a, b) => a + b, 0);
        return sum / solves.length / 100; // convert ms → seconds
    }

    getAverages(allResults) {
        return allResults.flatMap((result) => result.average);
    }

    getPersonalRecords(data, event) {
        return {
            single: data.rank.singles.find((e) => e.eventId === event)?.best || null,
            average: data.rank.averages.find((e) => e.eventId === event)?.best || null,
        };
    }

    async handleRequest(req, res) {
        const { wcaId, event } = req.params;
        const { num, getsolves, getaverages } = req.query;

        try {
            const data = await this.fetchCompetitorData(wcaId);

            if (event === 'name') {
                return res.json(this.getCompetitorName(data));
            }

            const allResults = this.getAllResultsForEvent(data, event);
            const solvecount = parseInt(num, 10) || 12;

            if (getsolves) {
                return res.json({
                    allResults: allResults.flatMap((result) => result.solves.reverse()),
                });
            } else if (getaverages) {
                return res.json({ allAverages: this.getAverages(allResults) });
            }

            const solves = this.getSolves(allResults, solvecount);
            const avg = this.calculateAverage(solves);
            const pr = this.getPersonalRecords(data, event);

            return res.status(200).json({ average: avg, records: pr });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
}

class StatusApi {
    constructor() {
        this.password = sha256Hash(process.env.STATUS_PAGE_PASSWORD || '');
    }

    handleRequest(req, res) {
        const { password } = req.body || {};
        const hashedPassword = sha256Hash(password || '');

        if (hashedPassword !== this.password) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const uptime = process.uptime();
        const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

        const logFileSize = this.getLogFileSize();
        const logStats = this.analyzeLogs(req);

        return res.json({
            uptime: `${uptime.toFixed(2)} seconds`,
            memoryUsage: `${memoryUsage} MB`,
            logFileSize: `${logFileSize} MB`,
            logs: logStats,
        });
    }

    analyzeLogs(req) {
        const betaTest = req.get('host').includes(':8001');

        const logPath = path.join(__dirname, '../log', betaTest ? 'beta.log' : 'server.log');

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
            ips: {},
            avgResponseTimeMs: {},
            errorRate: 0,
            peakHours: {},
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

            stats.totalRequests++;

            // HTTP methods
            stats.methods[entry.method] = (stats.methods[entry.method] || 0) + 1;

            // Endpoints
            stats.endpoints[entry.url] = (stats.endpoints[entry.url] || 0) + 1;

            // Status codes
            stats.statusCodes[entry.status] = (stats.statusCodes[entry.status] || 0) + 1;

            if (entry.status >= 400) totalErrors++;

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

            // IPs
            if (entry.ip) {
                stats.ips[entry.ip] = (stats.ips[entry.ip] || 0) + 1;
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

    getLogFileSize() {
        try {
            const logPath = path.join(
                __dirname,
                '../../log',
                this.betaTest ? 'beta.log' : 'server.log',
            );
            const stats = fs.statSync(logPath);
            return (stats.size / 1024 / 1024).toFixed(2);
        } catch {
            return '0.00';
        }
    }
}

function sha256Hash(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}

const wcaApi = new WcaApi();
const statusApi = new StatusApi();

// Status API endpoint
router.post('/api/status', (req, res) => statusApi.handleRequest(req, res));

// Wire class into router
router.get('/api/wca/:wcaId/:event', (req, res) => wcaApi.handleRequest(req, res));

router.get('/api/version', (req, res) => {
    res.json({ version: packageJson.version });
});

module.exports = router;
