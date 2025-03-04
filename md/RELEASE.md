# CubingTools.de Release Notes

## Overview
CubingTools.de is a comprehensive suite of tools designed for competitive cubing enthusiasts. This release includes various tools and pages that help users optimize event performances, track solve times, analyze competitor data, and manage cubing competitions. Below is a detailed description of each tool, page, and JavaScript file included in this release.

## Tools and Pages

### 1. Guildford Optimizer
**Filepath:** `/public/html/tools/guildford/guildford.html`
- **Description:** The Guildford Optimizer helps users plan and optimize event combinations for the Guildford challenge between two competitors based on their World Cube Association (WCA) average times. It fetches and displays WCA data for each competitor and calculates optimal event divisions to minimize total solve time.
- **Features:**
    - Fetches WCA data for competitors.
    - Calculates optimal event divisions.
    - Updates URL with form data.
- **JavaScript:** `/public/html/tools/guildford/guildford.js`
        - Handles event selection, form data updates, and WCA data fetching.
        - Calculates optimal event divisions and updates the URL with form data.

### 2. Competition Grouping
**Filepath:** `/public/html/tools/grouping/grouping.html`
- **Description:** This tool manages cubing competitions, allowing organizers to select events, manage competitors, and assign groups. It provides a streamlined interface for event setup, competitor registration, and automated group assignments based on selected parameters.
- **Features:**
    - Event selection and setup.
    - Competitor registration.
    - Automated group assignments.
- **JavaScript:** `/public/html/tools/grouping/grouping.js`
        - Manages competition setup, event selection, competitor registration, and group assignments.

### 3. Global Calculator
**Filepath:** `/public/html/tools/globalCalc/globalCalc.html`
- **Description:** The Global Calculator allows users to analyze their cube solve times by uploading a csTimer file or fetching data from the WCA API. It provides detailed analysis and visualization of solve times.
- **Features:**
    - File upload and WCA data fetching.
    - Detailed analysis and visualization.
    - Session data processing and chart updates.
- **JavaScript:** `/public/html/tools/globalCalc/globalCalc.js`
        - Handles file uploads, WCA data fetching, and data visualization.
        - Processes session data, initializes sliders, and updates charts.

### 4. WCA Average Calculator
**Filepath:** `/public/html/tools/average/average.html`
- **Description:** This tool allows users to track and manage competition times for WCA events. Users can input times, calculate averages, and view their personal ranks against official results via the WCA API. It also lets users save and view tagged averages.
- **Features:**
    - Time input and average calculation.
    - Personal rank fetching.
    - Saving and displaying tagged averages.
- **JavaScript:** `/public/html/tools/average/average.js`
        - Manages time input, average calculation, and personal rank fetching.
        - Handles saving and displaying tagged averages.

### 5. Privacy Policy
**Filepath:** `/public/html/privacy.html`
- **Description:** Manages the display of privacy policies on the website. Users can select different policy versions from a dropdown menu to view the corresponding content.
- **Features:**
    - Dropdown menu for policy versions.
    - Fetching and displaying selected policy content.
- **JavaScript:** `/public/js/privacy.js`
        - Populates the dropdown with policy versions and fetches the selected policy content.

### 6. Setup Page
**Filepath:** `/public/js/setupPage.js`
- **Description:** Handles the setup of common elements across the website, such as the cookie consent banner, navbar, footer, and version tag.
- **Features:**
    - Cookie consent management.
    - Navbar and footer setup.
    - Loading tools and version tag setup.

### 7. Server
**Filepath:** `/backend/server.js`
- **Description:** The server-side script that sets up the Express server, handles HTTPS configuration, and serves static files. It also logs requests and manages API routes.
- **Features:**
    - Express server configuration.
    - HTTPS setup.
    - Request logging and API route management.

### 8. Tools API
**Filepath:** `/backend/API/tools.js`
- **Description:** Provides an API endpoint to get the list of HTML files with metadata for the tools available on the website.
- **Features:**
    - Metadata extraction from HTML files.
    - Returning list of tools with titles and descriptions.

## Conclusion
This release of CubingTools.de provides a robust set of tools and features for competitive cubing enthusiasts. Each tool and page is designed to enhance the user's cubing experience by providing detailed analysis, optimization, and management capabilities. We hope you find these tools useful and look forward to your feedback.