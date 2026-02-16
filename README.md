# CubingTools.de

Welcome to **CubingTools.de**—a comprehensive suite of tools for cubing competitions, aimed at enhancing event management, competitor tracking, and performance optimization. This platform is designed for cubing enthusiasts, competition organizers, and participants, offering a set of tools that simplify various aspects of competitive cubing events.

## Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [Highlighted Files](#highlighted-files)
- [Installation](#installation)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

CubingTools.de provides a range of utilities focused on optimizing the competition experience for all participants. From setting up group events to calculating the most efficient ways to tackle the Guildford Challenge, analyzing solve patterns, and tracking performance metrics, this platform ensures a streamlined, user-friendly experience. 

With tools specifically designed for event grouping, performance tracking, Guildford optimization, and statistical analysis, the site is a one-stop solution for managing a wide variety of cubing events with ease.

---

## Key Features

1. **Comprehensive Event Setup and Management**
   - Choose from a list of standard cubing events or create custom events.
   - Set parameters like maximum competitors per group and automatically assign roles such as scramblers, judges, and runners.

2. **Participant Tracking and Grouping**
   - Add competitors by name or WCA ID.
   - Assign participants to events, manage groups, and optimize roles to ensure a balanced competition structure.
   - Generate group assignments dynamically and visualize participant distribution across events.

3. **Guildford Challenge Optimizer**
   - Calculate optimal event assignment splits between two competitors to minimize the combined time for all events.
   - Pull competitors' average times from WCA data for accurate and efficient event assignments.
   - Provide a user-friendly interface for configuring event times and instantly display optimized results.

4. **Average Calculator and Session Tracking**
   - Track solve times across cubing events with automatic average and mean calculations.
   - Support for penalties (DNF, +2) and target-time-to-finish (TFT) calculations.
   - WCA integration for ranking solves and averages against official competition records.
   - Persistent session storage with event-specific data management via cookies.

5. **Global Solve Analysis**
   - Upload and analyze solve data from CSTimer exports or fetch directly from WCA profiles.
   - Generate frequency distribution charts of solve times.
   - Calculate predicted global averages and identify most common solve times.
   - Visual insights with adjustable data range slicing.

6. **WCA Integration**
   - Fetch real-time average times and all solves from WCA profiles for accurate data.
   - Automatically populate form fields based on WCA IDs, simplifying data entry for competitors.
   - Display competitor rankings based on WCA record comparisons.

7. **Result Analysis and Reporting**
   - Generate detailed reports on event outcomes, participant performance, and overall competition statistics.
   - Export results in various formats for easy sharing and record-keeping.

8. **Customizable Event Parameters**
   - Adjust event settings such as time limits, cutoffs, and round formats to suit specific competition needs.
   - Save and load event configurations for recurring competitions.

---

## Highlighted Files

The following files include some of the most advanced and impactful features on **CubingTools.de**:

### `guildford.js`
Facilitates the Guildford Challenge optimization with:
   - **URL Data Management:** Uses URL parameters to manage and retrieve competitor data, ensuring a quick setup for repeated uses.
   - **Time Optimization and Split Calculation:** Analyzes event times and splits events between two competitors to minimize overall time using dynamic programming.
   - **WCA Data Integration:** Pulls data from WCA for accurate timing and updates UI to display the optimal event division for both competitors.
   - **Event Customization:** Supports multiple relay formats (Guildford, Mini-Guildford, with FTO variants) and custom event selection.

### `grouping.js`
Manages event setup and group assignments, providing:
   - **Event Selection and Customization:** Choose from standard cubing events or add custom events, each displayed dynamically on the user interface.
   - **Competitor Grouping and Role Assignment:** Automatically generates groups for each event, assigns competitors using Round Robin, Linear, or Random sorting, and includes optional helpers (judges, runners).
   - **Dynamic UI Management:** Seamlessly updates the page with competitor data, group lists, and role assignments, ensuring a real-time setup experience.
   - **URL State Persistence:** Saves and loads competition data via URL encoding for easy sharing.

### `average.js`
Comprehensive solve tracking and statistical analysis:
   - **Session Management:** Track solves with real-time average/mean calculations and penalty handling.
   - **WCA Ranking Integration:** Displays personal ranks for solves and averages against WCA competition data.
   - **Performance Metrics:** Calculates best possible average (BPA), worst possible average (WPA), and time-for-target (TFT) predictions.
   - **Event-Specific Storage:** Persists averages per event using browser cookies for multi-session continuity.

### `globalCalc.js`
Advanced solve pattern analysis and visualization:
   - **Data Source Flexibility:** Supports CSTimer file uploads and direct WCA profile fetching.
   - **Frequency Distribution:** Generates bar charts showing solve time frequencies with adjustable data range.
   - **Statistical Insights:** Identifies top 5 most common solve times and calculates predicted global benchmarks.
   - **Interactive Slicing:** Allows filtering analysis by recent solves with a dynamic slider control.

### `server.js` & `api.js`
Backend infrastructure providing:
   - **Express.js Server:** Handles static file serving and API routing with request logging.
   - **WCA Data API:** Fetches competitor profiles, solves, averages, and personal records from the WCA REST API.
   - **Status Monitoring:** Provides uptime, memory usage, and detailed request analytics for server health inspection.
   - **Security:** Implements input sanitization and configurable rate limiting.

---

## Installation

If you're setting up a local version for development:

1. Clone the repository:
   ```bash
   git clone https://github.com/s-kling/cubingtools.de.git
   ```
2. Navigate to the project directory:
   ```bash
   cd cubingtools.de
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a `.env` file in the backend directory with required configuration variables.
5. Configure your ports in `backend/config.json` with `prod_port` and `beta_port` settings.
6. Start the development server using the provided startup script:
   ```bash
   ./bin/start.sh
   ```
   The script will prompt you to select between:
   - Production server (default port 8000)
   - Beta server (default port 8001)
   - Both servers simultaneously
   
   It automatically kills any existing processes on the selected ports, sets up logging, and opens the application in your browser.

   **Interactive Commands:**
   - Type `q` to quit all servers

This will launch the application on a local server, accessible at either `http://localhost:8000` (production) or `http://localhost:8001` (beta), depending on your configuration and selection.

---

## Usage

1. **Access the Platform**
   - Visit **[CubingTools.de](https://cubingtools.de)** to access the suite of cubing tools directly.
   - Navigate through the site to find specific tools like the Groupifier, Guildford Optimizer, or Average Calculator.

2. **Using Grouping Tool**
   - Set up competitions with custom names and competitor limits.
   - Select events from standard WCA events or create custom ones.
   - Add competitors by name or WCA ID.
   - Generate optimized group assignments with role distribution.
   - Share configurations via URL encoding.

3. **Using Guildford Challenge Optimizer**
   - Input two competitors' WCA IDs or manually enter event times.
   - Configure relay format (Guildford, Mini-Guildford, etc.).
   - Adjust pickup time and analyze splits.
   - View optimal event assignments to minimize combined completion time.

4. **Using Average Calculator**
   - Enter solve times for any cubing event.
   - Automatic calculation of averages of 5, means of 3, and performance metrics.
   - Apply penalties (DNF, +2) and track rankings against WCA data.
   - Data persists per event across sessions.

5. **Using Global Solve Analysis**
   - Upload CSTimer export files or enter WCA ID for direct data fetching.
   - Visualize solve time frequency distribution.
   - Identify patterns and establish performance benchmarks.
   - Adjust data range slider to focus on recent or all-time solves.

6. **Result Analysis and Reporting**
   - Use the reporting tools to generate detailed performance reports and competition statistics.
   - Export results in preferred formats for documentation and sharing.

---

## Contributing

1. Fork the repository and create a new branch for your feature:
   ```bash
   git checkout -b feature-branch
   ```
2. Make changes and commit:
   ```bash
   git commit -m "Add feature description"
   ```
3. Push to your branch and submit a Pull Request.

---

## License

This project is licensed under the MIT License.

---

This README provides an overview and usage guide for **CubingTools.de**, detailing the primary functionalities across all major tools. For more information, visit [CubingTools.de](https://cubingtools.de).
