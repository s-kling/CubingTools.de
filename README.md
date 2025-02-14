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

CubingTools.de provides a range of utilities focused on optimizing the competition experience for all participants. From setting up group events to calculating the most efficient ways to tackle the Guildford Challenge, this platform ensures a streamlined, user-friendly experience. 

With tools specifically designed for event grouping, performance tracking, and result analysis, the site is a one-stop solution for managing a wide variety of cubing events with ease.

---

## Key Features

1. **Comprehensive Event Setup and Management**
   - Select from a list of common cubing events or add custom events.
   - Define parameters like maximum competitors per group and automatically assign roles such as scramblers, judges, and runners.

2. **Participant Tracking and Grouping**
   - Add competitors by name or WCA ID.
   - Assign participants to events, manage groups, and optimize roles to ensure a balanced competition structure.
   - Generate group assignments dynamically and visualize participant distribution across events.

3. **Guildford Challenge Optimizer**
   - A unique tool that calculates optimal event assignment splits between two competitors to minimize the combined time for all events.
   - Pulls competitors' average times from WCA data, ensuring accurate and efficient event assignments.
   - Provides a user-friendly interface for configuring event times and instantly displays optimized results.

4. **WCA Integration**
   - Fetch real-time average times from WCA profiles, allowing event times to be calculated accurately based on official records.
   - Automatically populates form fields based on WCA IDs, simplifying data entry for competitors.

5. **Result Analysis and Reporting**
   - Generate detailed reports on event outcomes, participant performance, and overall competition statistics.
   - Export results in various formats for easy sharing and record-keeping.

6. **Customizable Event Parameters**
   - Adjust event settings such as time limits, cutoffs, and round formats to suit specific competition needs.
   - Save and load event configurations for recurring competitions.

---

## Highlighted Files

The following files include some of the most advanced and impactful features on **CubingTools.de**:

### `grouping.js`
Manages event setup and group assignments, providing:
   - **Event Selection and Customization:** Choose from standard cubing events or add custom events, each displayed dynamically on the user interface.
   - **Competitor Grouping and Role Assignment:** Automatically generates groups for each event, assigns competitors, and includes optional helpers (judges, runners).
   - **Dynamic UI Management:** Seamlessly updates the page with competitor data, group lists, and role assignments, ensuring a real-time setup experience.

### `guildford.js`
Facilitates the Guildford Challenge optimization with:
   - **URL Data Management:** Uses URL parameters to manage and retrieve competitor data, ensuring a quick setup for repeated uses.
   - **Time Optimization and Split Calculation:** Analyzes event times and splits events between two competitors to minimize overall time.
   - **WCA Data Integration and Visualization:** Pulls data from WCA for accurate timing and updates UI to display the optimal event division for both competitors.

These two files represent some of the best features on **CubingTools.de**, delivering efficient event setup and advanced performance optimization.

---

## Installation

If you’re setting up a local version for development:

1. Clone the repository:
    ```bash
    git clone https://github.com/your-repo/cubingtools.de.git
    ```
2. Install dependencies if any are listed.
3. Use a local server or any HTTP server to serve the HTML/JavaScript files for testing.

---

## Usage

1. **Access the Platform**
   - Visit **[CubingTools.de](https://cubingtools.de)** to access the suite of cubing tools directly.
   - Navigate through the site to find specific tools like the Event Manager or the Guildford Challenge Optimizer.

2. **Using Grouping and Guildford Tools**
   - In the **Event Manager** section, set up events, add competitors, assign groups, and optimize competitor distribution within groups.
   - In the **Guildford Challenge Optimizer**, input competitor times, fetch WCA data, and get an optimized split of events for faster completion.

3. **Result Analysis and Reporting**
   - Use the reporting tools to generate detailed performance reports and competition statistics.
   - Export results in preferred formats for documentation and sharing.

4. **Customizing Event Parameters**
   - Adjust settings for each event to match the specific requirements of your competition.
   - Save configurations for future use to streamline the setup process for recurring events.

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

This README provides a quick overview and usage guide for **CubingTools.de** and highlights the primary functionalities in `grouping.js` and `guildford.js`. For more details, please visit [CubingTools.de](https://cubingtools.de).
