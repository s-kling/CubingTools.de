const express = require('express');
const axios = require('axios');
const router = express.Router();
const path = require('path');
const nodemailer = require('nodemailer');
const sanitizeHtml = require('sanitize-html');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // Specify the path to the .env file

// API endpoint to get WCA data based on competitor ID and event
router.get('/api/wca/:wcaId/:event', async (req, res) => {
    const { wcaId, event } = req.params;   // Extract WCA ID and event from URL path parameters
    const { num, getsolves, getaverages } = req.query;  // Extract 'num' (number of solves) and 'getsolves' query params

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
        let solves = allResults
            .flatMap(result => result.solves.reverse())  // Reverse to get the latest solves first

        // If 'getsolves' query param is true, return all solves before slicing
        if (getsolves) {
            return res.json({ allResults: solves });
        } else if (getaverages) {
            let averages = allResults
                .flatMap(result => result.average);

            return res.json({ allAverages: averages });
        }

        // Limit the number of solves to the requested amount
        solves = solves.filter(result => result > 0)    // Only consider completed solve times
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
        const avg = (sum / solves.length) / 100;  // Divide by 100 for correct unit

        // Return the calculated average solve time
        res.status(200).json({ average: avg });

    } catch (error) {
        // Handle errors and send appropriate error response
        res.status(500).json({ error: error.message });
    }
});

const styles = `
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap');

    :root {
        --main-radius: 5px;
        --space-xxs: 4px;
        --space-xs: 8px;
        --space-sm: 12px;
        --space-md: 20px;
        --space-lg: 32px;
        --space-xl: 52px;
        --space-xxl: 84px;
        --main-background: #121212;
        --secondary-background: #1f1f1f;
        --main-lighter: #272727;
        --main-text: #ffffff;
        --secondary-text: #b3b3b3;
        --hover-text: #ffffff;
        --hover-background: #444444;
        --link-color: #0088cc;
        --link-underline: #ffffff;
        --input-background: #2c2c2c;
        --input-border: #444444;
        --button-background: #3a86ff;
        --font-main: 'Inter', sans-serif;
        --font-size-base: 16px;
        --font-size-lg: 18px;
        --font-size-xl: 32px;
        --main-padding: 16px;
        --main-margin: 8px;
        --card-width: 320px;
        --card-height: 200px;
    }

    body {
        background-color: var(--main-background);
        color: var(--main-text);
        font-family: var(--font-main);
    }

    .event-group {
        background-color: var(--input-background);
        border: 1px solid var(--input-border);
        border-radius: var(--main-radius);
        padding: var(--space-xs);
        margin: var(--space-md) var(--space-sm);
    }

    .event-group h3 {
        margin-bottom: var(--space-sm);
        font-size: 1.25rem;
    }

    .group {
        border-radius: var(--main-radius);
        background-color: var(--hover-background);
        padding: var(--space-sm);
        margin-bottom: var(--space-xs);
    }

    .group ul li {
        margin-left: var(--space-lg);
    }

    .group div {
        color: var(--secondary-text);
    }

    .group div span {
        color: var(--main-text);
    }

    .competitor-assignments {
        margin-top: var(--space-lg);
        border: 1px solid var(--input-border);
    }

    .competitor-assignments h4 {
        padding: 10px 0 0 10px;
    }

    .competitor-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: var(--space-md);
    }

    .competitor-table th,
    .competitor-table td {
        padding: var(--space-sm);
        text-align: left;
        border-bottom: 1px solid var(--input-border);
    }

    .competitor-table th {
        background-color: var(--main-lighter);
        position: sticky;
        top: 0;
        z-index: 1;
    }

    .competitor-table td {
        background-color: var(--input-background);
    }
</style>
`;

// router.post('/api/send-email', async (req, res) => {
//     const { email, competitionData, selectedEvents } = req.body;
//     console.log('Email:', email, 'Competition Data:', competitionData, 'Selected Events:', selectedEvents);


//     // Generate HTML for grouping results and competitor assignments
//     let html = '<div class="competitor-assignments"><h4>Competitor Assignments</h4>';
//     selectedEvents.forEach(event => {
//         html += `<div class="event-group"><h3>${event}</h3>`;
//         const groups = competitionData[event];
//         groups.forEach(group => {
//             html += `<div class="group"><h4>Group ${group.groupNumber}</h4><ul>`;
//             group.competitors.forEach(competitor => {
//                 html += `<li>${competitor.name} (${competitor.wcaId})</li>`;
//             });
//             html += '</ul></div>';
//         });
//         html += '</div>';
//     });
//     html += '</div>';

//     html = '<p style="font-style: italic;">This email was sent automatically through the <a href="https://cubingtools.de/tools/grouping">CubingTools.de Grouping Tool</a>. If you did not request an email from CubingTools, or aren\'t signed up for a competition, delete this email as soon as possible.</p>' + styles + html;

//     // Create a transporter object using the default SMTP transport
//     const transporter = nodemailer.createTransport({
//         host: process.env.EMAIL_HOST,
//         port: 587,
//         secure: false, // true for 465, false for other ports
//         auth: {
//             user: process.env.EMAIL_USER, // generated ethereal user
//             pass: process.env.EMAIL_PASSWORD // generated ethereal password
//         }
//     });

//     // Setup email data for the recipient
//     const mailOptions = {
//         from: `"CubingTools" <${process.env.EMAIL_USER}>`, // sender address
//         to: email, // list of receivers
//         subject: 'Grouping Results', // Subject line
//         html: html // html body
//     };

//     try {
//         // Send mail to the recipient
//         await transporter.sendMail(mailOptions);
//         res.status(200).json({ message: 'Email sent successfully' });
//     } catch (error) {
//         console.error('Error sending email:', error);
//         res.status(500).json({ message: 'Failed to send email' });
//     }
// });

module.exports = router;
