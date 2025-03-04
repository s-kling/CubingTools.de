/**
 * This module defines the API routes for the cubingtools.de backend.
 * It includes endpoints for fetching WCA data, CubingContests data, and metadata for HTML tools.
 * 
 * Dependencies:
 * - express: Web framework for Node.js
 * - axios: Promise-based HTTP client for the browser and Node.js
 * - path: Utilities for working with file and directory paths
 * - fs: File system module for interacting with the file system
 * - dotenv: Loads environment variables from a .env file into process.env
 * 
 * API Endpoints:
 * 
 * 1. GET /api/wca/:wcaId/:event
 *    Fetches WCA data based on competitor ID and event.
 *    - URL Parameters:
 *      - wcaId: The WCA ID of the competitor (e.g., 2023ABCD01)
 *      - event: The event to fetch data for (e.g., '333', 'name')
 *    - Query Parameters:
 *      - num: Number of solves to return (default is 12)
 *      - getsolves: If true, returns all solves
 *      - getaverages: If true, returns all averages
 *    - Response:
 *      - JSON object containing the requested data (e.g., name, solves, averages, or average solve time)
 * 
 * 2. GET /api/version
 *    Returns the version of the application.
 *    - Response:
 *      - JSON object containing the version (e.g., { version: "1.0.0" })
 * 
 * 3. GET /api/cc/:eventId/:competitors
 *    Fetches CubingContests data for specific competitors in an event.
 *    - URL Parameters:
 *      - eventId: The ID of the event (e.g., '333')
 *      - competitors: Comma-separated list of competitor names or WCA IDs
 *    - Response:
 *      - JSON array containing the world ranking and time for each competitor
 * 
 * 4. GET /api/tools
 *    Returns a list of HTML files with metadata from the tools directory.
 *    - Response:
 *      - JSON array containing the filename, title, and description of each HTML file
 * 
 * 5. GET /
 *    Serves the main page.
 *    - Response:
 *      - HTML file for the main page
 * 
 * 6. GET /status
 *    Returns the status report of the server.
 *    - Response:
 *      - JSON object containing the uptime, memory usage, and log file size
 * 
 * 7. GET /privacy-policy
 *    Serves the privacy policy page.
 *    - Response:
 *      - HTML file for the privacy policy page
 * 
 * 8. GET /robots.txt
 *    Serves the robots.txt file.
 *    - Response:
 *      - robots.txt file
 * 
 * 9. GET /404
 *    Serves the 404 error page.
 *    - Response:
 *      - HTML file for the 404 error page
 * 
 * 10. GET /apple-touch-icon.png
 *     Serves the apple-touch-icon.png file.
 *     - Response:
 *       - apple-touch-icon.png file
 * 
 * 11. GET /sitemap.xml
 *     Serves the sitemap.xml file.
 *     - Response:
 *       - sitemap.xml file
 * 
 * 12. GET /googlea20166777fc211f6.html
 *     Serves the google.html file for Google verification.
 *     - Response:
 *       - google.html file
 * 
 * 13. GET /tools/:toolName
 *     Serves specific tool pages.
 *     - URL Parameters:
 *       - toolName: The name of the tool
 *     - Response:
 *       - HTML file for the specified tool
 * 
 * 14. GET /css/:cssName
 *     Serves specific tool CSS files.
 *     - URL Parameters:
 *       - cssName: The name of the CSS file
 *     - Response:
 *       - CSS file for the specified tool
 * 
 * 15. GET /js/:jsName
 *     Serves specific tool JavaScript files.
 *     - URL Parameters:
 *       - jsName: The name of the JavaScript file
 *     - Response:
 *       - JavaScript file for the specified tool
 * 
 * 16. GET *
 *     Catch-all route for non-existing paths.
 *     - Response:
 *       - Redirects to the 404 error page with the directory as a query parameter
 * 
 * Usage:
 * - Import the router module and use it in an Express application.
 * - Ensure the .env file is present in the appropriate directory with necessary environment variables.
 * - Place HTML, CSS, and JavaScript files in the specified directories for serving.
 * 
 * Example:
 * const express = require('express');
 * const apiRouter = require('./path/to/this/file');
 * const app = express();
 * app.use('/', apiRouter);
 * app.listen(3000, () => console.log('Server running on port 3000'));
 */