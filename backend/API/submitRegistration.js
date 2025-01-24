const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const nodemailer = require('nodemailer');
const crypto = require('crypto');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // Specify the path to the .env file

router.post('/submit-registration', async (req, res) => {
    const { fullName, email, wcaId, events, competitionName } = req.body;

    // Log the received data for now
    console.log('Received registration data:', {
        fullName,
        email,
        wcaId,
        events,
        competitionName,
    });

    // Check if the email has a cubingtools.de domain
    if (email.endsWith('@cubingtools.de')) {
        return res.status(400).json({
            message: 'Registrations from cubingtools.de domain are not allowed',
        });
    }

    // Add random identifier
    const RNG = Math.floor(Math.random() * 100000);

    // Generate a unique token for the competitor
    const token = crypto
        .createHash('sha256')
        .update(RNG + competitionName + fullName + email + wcaId)
        .digest('hex');

    // Check if the token already exists in the competitors.json file
    const filePath = path.resolve(__dirname, '../data/competitors.json');
    let competitorsData = {};

    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        competitorsData = JSON.parse(data);

        for (const competition in competitorsData) {
            const competitors = competitorsData[competition];
            for (const competitor of competitors) {
                if (competitor.token === token) {
                    return res.status(400).json({
                        message: 'A competitor with the same token already exists',
                    });
                }
            }
        }
    }

    try {
        // Add the competitor to the competitors.json file
        const result = await addCompetitorToFile(
            fullName,
            email,
            wcaId,
            events,
            competitionName,
            token
        );

        if (result.error) {
            return res.status(400).json({ message: result.message });
        }

        // Send confirmation email to the competitor and organizers
        await sendConfirmationEmail(fullName, email, competitionName, token, req);

        // Respond with a success message
        res.status(200).json({ message: 'Registration data received successfully' });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Failed to process registration' });
    }
});

router.get('/confirm-registration', async (req, res) => {
    const { token } = req.query;

    // Search for user with the given token in the competitors.json file
    // If found, update the verified field to true
    // If not found, return an error message
    const filePath = path.resolve(__dirname, '../data/competitors.json');
    let competitorsData = {};

    // Read the existing competitors data
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        competitorsData = JSON.parse(data);
    }

    // Search for the competitor with the given token
    let competitorFound = false;
    for (const competition in competitorsData) {
        const competitors = competitorsData[competition];
        for (const competitor of competitors) {
            if (competitor.token === token) {
                if (competitor.verified) {
                    return res
                        .status(400)
                        .json({ message: 'This registration has already been confirmed' });
                }
                competitor.verified = true;
                competitorFound = true;
                break;
            }
        }
        if (competitorFound) break;
    }

    // If competitor is found, update the file and respond with success
    if (competitorFound) {
        fs.writeFileSync(filePath, JSON.stringify(competitorsData, null, 2), 'utf8');

        // Send confirmation email to the competitor and organizers
        await confirmCompetitors(token);

        // Send the html site to the user
        res.sendFile(path.join(__dirname, '..', '../public/html', 'confirmed-email.html'));
    } else {
        res.status(400).json({ message: 'Invalid or expired token' });
    }
});

async function addCompetitorToFile(fullName, email, wcaId, events, competitionName, token) {
    const filePath = path.resolve(__dirname, '../data/competitors.json');
    let competitorsData = {};

    // Read the existing competitors data
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        competitorsData = JSON.parse(data);
    }

    // Initialize the competition array if it doesn't exist
    if (!competitorsData[competitionName]) {
        competitorsData[competitionName] = [];
    }

    // Add the new competitor to the appropriate competition
    competitorsData[competitionName].push({
        fullName,
        email,
        wcaId,
        events,
        token,
        verified: false,
    });

    // Write the updated data back to the file
    fs.writeFileSync(filePath, JSON.stringify(competitorsData, null, 2), 'utf8');
    return { error: false };
}

async function sendConfirmationEmail(fullName, email, competitionName, token, req) {
    // Create a transporter object using the default SMTP transport
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: process.env.EMAIL_USER, // generated ethereal user
            pass: process.env.EMAIL_PASSWORD, // generated ethereal password
        },
    });

    // Setup email data for the competitor
    const competitorMailOptions = {
        from: `"CubingTools" <${process.env.EMAIL_USER}>`, // sender address
        to: email, // list of receivers
        subject: `${competitionName} Registration Confirmation`, // Subject line
        text: `Dear ${fullName},\n\nWe received your registration for ${competitionName}. Please click the following link to confirm your registration:\n\n${
            req.protocol
        }://${req.get(
            'host'
        )}/confirm-registration?token=${token}\n\nBest regards,\nCubingTools Competitions Team`, // plain text body
    };

    // Send mail to the competitor
    await transporter.sendMail(competitorMailOptions);
}

async function confirmCompetitors(token) {
    // Find the competitor from the token in the competitors.json file
    const filePath = path.resolve(__dirname, '../data/competitors.json');
    let competitorsData = {};

    // Read the existing competitors data
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        competitorsData = JSON.parse(data);
    }

    // Search for the competitor with the given token
    let competitor = null;
    let competitionName = '';
    for (const competition in competitorsData) {
        const competitors = competitorsData[competition];
        for (const comp of competitors) {
            if (comp.token === token) {
                competitor = comp;
                competitionName = competition;
                break;
            }
        }
        if (competitor) break;
    }

    if (!competitor) {
        throw new Error('Competitor not found');
    }

    const { fullName, email, wcaId, events, verified } = competitor;

    if (!verified) {
        return;
    }

    // Create a transporter object using the default SMTP transport
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: process.env.EMAIL_USER, // generated ethereal user
            pass: process.env.EMAIL_PASSWORD, // generated ethereal password
        },
    });

    // Setup email data for the competitor
    const competitorMailOptions = {
        from: `"CubingTools" <${process.env.EMAIL_USER}>`, // sender address
        to: email, // list of receivers
        subject: `${competitionName} Registration Confirmation`, // Subject line
        text: `Dear ${fullName},\n\nThank you for registering for ${competitionName}.\n\nYour WCA ID: ${wcaId}\nSelected Events: ${events.join(
            ', '
        )}\n\nBest regards,\nCubingTools Competitions Team`, // plain text body
    };

    // Setup email data for the organizers
    const organizerMailOptions = {
        from: `"CubingTools" <${process.env.EMAIL_USER}>`, // sender address
        to: 'competitions@cubingtools.de', // list of receivers
        subject: `New Registration for ${competitionName}`, // Subject line
        text: `A new competitor has registered for ${competitionName}.\n\nFull Name: ${fullName}\nEmail: ${email}\nWCA ID: ${wcaId}\nSelected Events: ${events.join(
            ', '
        )}`, // plain text body
    };

    // Send mail to the competitor
    await transporter.sendMail(competitorMailOptions);

    // Send mail to the organizers
    await transporter.sendMail(organizerMailOptions);
}

module.exports = router;
