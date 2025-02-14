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

    fs.readdir(toolsDir, (err, folders) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to scan directory' });
        }

        const htmlFiles = folders
            .filter((folder) => fs.statSync(path.join(toolsDir, folder)).isDirectory())
            .map((folder) => {
                const filePath = path.join(toolsDir, folder, `${folder}.html`);
                if (fs.existsSync(filePath)) {
                    const metadata = extractMetadata(filePath);
                    return {
                        filename: folder,
                        title: metadata.title,
                        description: metadata.description,
                    };
                } else {
                    return {
                        filename: folder,
                        title: 'No title',
                        description: 'No description',
                    };
                }
            });

        res.json(htmlFiles);
    });
});

module.exports = router;
