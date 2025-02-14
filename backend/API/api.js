const express = require('express');
const axios = require('axios');
const router = express.Router();
const path = require('path');
const packageJson = require('../../package.json');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // Specify the path to the .env file

// API endpoint to get WCA data based on competitor ID and event
router.get('/api/wca/:wcaId/:event', async (req, res) => {
    const { wcaId, event } = req.params; // Extract WCA ID and event from URL path parameters
    const { num, getsolves, getaverages } = req.query; // Extract 'num' (number of solves) and 'getsolves' query params

    // Construct the API URL to fetch WCA data based on the competitor ID
    const apiUrl = `https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/master/api/persons/${wcaId}.json`;

    try {
        // Fetch data from the WCA API
        const response = await axios.get(apiUrl);
        const data = response.data;

        // Handle request for competitor's name
        if (event === 'name') {
            return res.json({ name: data.name });
        }

        let allResults = [];

        // Loop through all competition results to find those matching the requested event
        for (const competition of Object.values(data.results)) {
            // If the competition contains the specified event, add its results
            if (competition[event]) {
                allResults = allResults.concat(competition[event]);
            }
        }

        // Default number of solves to 12 if 'num' is not provided
        const solvecount = parseInt(num, 10) || 12;

        // Extract and filter valid solves (greater than 0) from the results, reverse the order
        let solves = allResults.flatMap((result) => result.solves.reverse()); // Reverse to get the latest solves first

        // If 'getsolves' query param is true, return all solves before slicing
        if (getsolves) {
            return res.json({ allResults: solves });
        } else if (getaverages) {
            let averages = allResults.flatMap((result) => result.average);

            return res.json({ allAverages: averages });
        }

        // Limit the number of solves to the requested amount
        solves = solves
            .filter((result) => result > 0) // Only consider completed solve times
            .slice(0, solvecount);

        // If no solves exist, return null for average
        if (solves.length === 0) {
            return res.status(200).json({ average: null });
        }

        // Sort the solves in ascending order
        solves.sort((a, b) => a - b);

        // Remove the fastest and slowest solves to eliminate outliers
        solves = solves.slice(1, -1);

        // Calculate the average solve time (in seconds) and divide by 100 to convert milliseconds to seconds
        const sum = solves.reduce((a, b) => a + b, 0);
        const avg = sum / solves.length / 100; // Divide by 100 for correct unit

        // Return the calculated average solve time
        res.status(200).json({ average: avg });
    } catch (error) {
        // Handle errors and send appropriate error response
        res.status(500).json({ error: error.message });
    }
});

router.get('/api/version', (req, res) => {
    res.json({ version: packageJson.version });
});

// Endpoint to handle the request
router.get('/api/cc/:eventId/:competitors', async (req, res) => {
    const { eventId, competitors } = req.params;
    const competitorList = competitors.split(',');

    try {
        // Fetch data for single and average results
        const singleResponse = await axios.get(
            `https://cubingcontests.com/api/results/rankings/${eventId}/single`
        );

        const singleRankings = singleResponse.data.rankings;

        // Helper to find competitor in rankings
        const findCompetitor = (inputNameOrId, rankings) => {
            // Define the regex for a WCA ID (e.g., format like 2023ABCD01)
            const wcaIdRegex = /^[0-9]{4}[A-Z]{4}[0-9]{2}$/;

            // Check if the input matches the WCA ID regex
            if (wcaIdRegex.test(inputNameOrId)) {
                console.log('Searching by WCA ID:', inputNameOrId);
                // Search by WCA ID
                return (
                    rankings.find(
                        (rank) => rank.persons[0].wcaId === inputNameOrId.toUpperCase()
                    ) || null
                );
            } else {
                console.log('Searching by name:', inputNameOrId);
                return rankings.find(
                    (rank) => rank.persons[0].name.toLowerCase() === inputNameOrId.toLowerCase()
                );
            }
        };

        // Prepare response data
        const result = competitorList.map((name) => {
            const singleData = findCompetitor(name, singleRankings);

            return {
                name,
                worldRanking: singleData?.ranking || 'N/A',
                time: singleData?.result || 'N/A',
            };
        });

        // Sort the result by world ranking
        result.sort((a, b) => {
            if (a.worldRanking === 'N/A') return 1;
            if (b.worldRanking === 'N/A') return -1;
            return a.worldRanking - b.worldRanking;
        });

        // Respond with data
        res.json(result);
    } catch (error) {
        console.error('Error fetching data:', error.message);
        res.status(500).json({ message: 'Failed to fetch data from CubingContests API' });
    }
});

module.exports = router;
