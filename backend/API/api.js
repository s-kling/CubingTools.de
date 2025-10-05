const express = require('express');
const axios = require('axios');
const router = express.Router();
const path = require('path');
const packageJson = require('../../package.json');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // Specify the path to the .env file

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

const wcaApi = new WcaApi();

// Wire class into router
router.get('/api/wca/:wcaId/:event', (req, res) => wcaApi.handleRequest(req, res));

router.get('/api/version', (req, res) => {
    res.json({ version: packageJson.version });
});

module.exports = router;
