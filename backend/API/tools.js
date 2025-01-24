const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Function to extract metadata from an HTML file
function extractMetadata(filePath) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    const titleMatch = fileContent.match(/<title>(.*?)<\/title>/);
    const title = titleMatch ? titleMatch[1] : 'No title';

    const descriptionMatch = fileContent.match(/<meta name="description" content="(.*?)">/);
    const description = descriptionMatch ? descriptionMatch[1] : 'No description';

    return { title, description };
}

// API endpoint to get the list of HTML files with metadata
router.get('/api/tools', (req, res) => {
    const toolsDir = path.join(__dirname, '../../public/html/tools');

    fs.readdir(toolsDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to scan directory' });
        }

        const htmlFiles = files
            .filter((file) => file.endsWith('.html'))
            .map((file) => {
                const filePath = path.join(toolsDir, file);
                const metadata = extractMetadata(filePath);
                return {
                    filename: file,
                    title: metadata.title,
                    description: metadata.description,
                };
            });

        res.json(htmlFiles);
    });
});

module.exports = router;
