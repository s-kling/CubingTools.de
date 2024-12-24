const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const nodemailer = require('nodemailer');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // Specify the path to the .env file

router.post('/submit-registration', async (req, res) => {
    const { fullName, email, wcaId, events, competitionName } = req.body;

    // Log the received data for now
    console.log('Received registration data:', { fullName, email, wcaId, events, competitionName });

    try {
        // Add the competitor to the competitors.json file
        const result = await addCompetitorToFile(fullName, email, wcaId, events, competitionName);

        if (result.error) {
            return res.status(400).json({ message: result.message });
        }

        // Send confirmation email to the competitor and organizers
        await sendConfirmationEmail(fullName, email, wcaId, events, competitionName);

        // Respond with a success message
        res.status(200).json({ message: 'Registration data received successfully' });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Failed to process registration' });
    }
});

async function addCompetitorToFile(fullName, email, wcaId, events, competitionName) {
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

    // Check for existing competitor with the same email or WCA ID
    const existingCompetitor = competitorsData[competitionName].find(comp => comp.email === email || (comp.wcaId && comp.wcaId === wcaId));

    if (existingCompetitor) {
        if (existingCompetitor.fullName === fullName && existingCompetitor.email === email && existingCompetitor.wcaId === wcaId) {
            if (JSON.stringify(existingCompetitor.events) === JSON.stringify(events)) {
                return { error: true, message: 'You can only register once.' };
            } else {
                // Update the competitor's events
                existingCompetitor.events = events;
                fs.writeFileSync(filePath, JSON.stringify(competitorsData, null, 2), 'utf8');
                return { error: false };
            }
        } else {
            return { error: true, message: 'This WCA ID or email is already in use. Please contact sebastian@cubingtools.de if you haven\'t registered yet.' };
        }
    }

    // Add the new competitor to the appropriate competition
    competitorsData[competitionName].push({ fullName, email, wcaId, events });

    // Write the updated data back to the file
    fs.writeFileSync(filePath, JSON.stringify(competitorsData, null, 2), 'utf8');
    return { error: false };
}

async function sendConfirmationEmail(fullName, email, wcaId, events, competitionName) {
    // Create a transporter object using the default SMTP transport
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: process.env.EMAIL_USER, // generated ethereal user
            pass: process.env.EMAIL_PASSWORD // generated ethereal password
        }
    });

    // Setup email data for the competitor
    const competitorMailOptions = {
        from: `"CubingTools" <${process.env.EMAIL_USER}>`, // sender address
        to: email, // list of receivers
        subject: `${competitionName} Registration Confirmation`, // Subject line
        text: `Dear ${fullName},\n\nThank you for registering for ${competitionName}.\n\nYour WCA ID: ${wcaId}\nSelected Events: ${events.join(', ')}\n\nBest regards,\nCubingTools Competitions Team`, // plain text body
    };

    // Setup email data for the organizers
    const organizerMailOptions = {
        from: `"CubingTools" <${process.env.EMAIL_USER}>`, // sender address
        to: 'competitions@cubingtools.de', // list of receivers
        subject: `New Registration for ${competitionName}`, // Subject line
        text: `A new competitor has registered for ${competitionName}.\n\nFull Name: ${fullName}\nEmail: ${email}\nWCA ID: ${wcaId}\nSelected Events: ${events.join(', ')}`, // plain text body
    };

    // Send mail to the competitor
    await transporter.sendMail(competitorMailOptions);

    // Send mail to the organizers
    await transporter.sendMail(organizerMailOptions);
}

module.exports = router;