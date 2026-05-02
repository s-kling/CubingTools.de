import express from 'express';
import path from 'path';
import fs from 'fs';
const router = express.Router();

// Function to extract metadata from an HTML file
function extractMetadata(filePath) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    const titleMatch = fileContent.match(/<title>(.*?)<\/title>/);
    const title = titleMatch ? titleMatch[1] : 'No title';

    const descriptionMatch = fileContent.match(/<meta name="description" content="(.*?)">/);
    const description = descriptionMatch ? descriptionMatch[1] : 'No description';

    const sloganMatch = fileContent.match(/<meta name="slogan" content="(.*?)">/);
    const slogan = sloganMatch ? sloganMatch[1] : description;

    const keywordsMatch = fileContent.match(/<meta name="keywords" content="(.*?)">/);
    const keywords = keywordsMatch ? keywordsMatch[1].split(',').map((k) => k.trim()) : [];
    // Remove the first 9 keywords, as they are all the same generic keywords
    const uniqueKeywords = keywords.slice(9);

    return { title, description, slogan, keywords: uniqueKeywords };
}

// API endpoint to get the list of HTML files with metadata
router.get('/api/tools', (req, res) => {
    const __dirname = path.dirname(new URL(import.meta.url).pathname);
    const toolsDir = path.join(__dirname, '../../public/tools');

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
                        slogan: metadata.slogan,
                        keywords: metadata.keywords,
                    };
                } else {
                    return {
                        filename: folder,
                        title: 'No title',
                        description: 'No description',
                        slogan: 'No description',
                        keywords: [],
                    };
                }
            });

        res.json(htmlFiles);
    });
});

export default router;
