# CubingTools.de

CubingTools.de is a toolkit for competitive cubing workflows: event grouping, Guildford planning, average tracking, and solve-distribution analysis.

Current version: `1.2.0`

## Table of Contents
- [Overview](#overview)
- [Tool Suite](#tool-suite)
- [Admin Features](#admin-features)
- [Backend/API](#backendapi)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## Overview

This project includes a Node.js/Express backend and a static frontend served from the same app.

Core goals:
- Competition planning support (grouping + helper role workflows)
- WCA-backed performance analysis
- Shareable workflows via URL state
- Operational tooling for admin moderation and monitoring

## Tool Suite

### Guildford Optimizer
Path: `public/tools/guildford/`

Features:
- Relay presets including FTO variants
- Custom relay composition
- Pickup-time-aware split optimization between two competitors
- WCA integration for names, averages, and solves
- URL sync for shareable setups

### Grouping Tool
Path: `public/tools/grouping/`

Features:
- Loads event definitions from `/events`
- Event search/select with optional custom events
- Dynamic or fixed group sizing
- Sorting strategies: Round Robin, Linear, Random
- Helper-role assignment support (judges/runners/scramblers)
- URL state restore for collaboration

### WCA Average Calculator
Path: `public/tools/average/`

Features:
- Solve entry with penalties (`+2`, `DNF`)
- Ao5/Mo3 and mean calculations
- BPA/WPA/TFT metrics
- WCA comparison data for ranking context
- Event-scoped cookie persistence for saved averages

### GlobalCalc
Path: `public/tools/globalCalc/`

Features:
- Data input from csTimer export or WCA ID
- Frequency distribution chart
- Adjustable analysis window (slider)
- Predicted global average and deviation metrics
- Best rolling average + simulated probability of beating it

## Admin Features

Path: `public/html/admin/`

### Admin authentication
- Password login endpoint: `POST /api/admin/login`
- Token verification endpoint: `GET /api/admin/verify`
- Session token stored in browser session storage

### Status dashboard
Page: `/admin/status`

Provides:
- Uptime and memory usage
- Log file size
- Request/error analytics
- Log explorer and detailed matching entries

### Message moderation and bans
Page: `/admin/messages`

Provides:
- View confirmed/unconfirmed messages
- Bulk delete and selection actions
- Email/IP-hash bans
- Appeal review and resolution workflow

### Developer TODO manager
Page: `/admin/dev-todo`

Provides:
- Protected read/write access to `md/TODO.md`
- Checkbox toggle + add-item workflow in UI

## Backend/API

Main backend paths:
- `backend/server.js`
- `backend/API/api.js`
- `backend/API/routes.js`
- `backend/API/tools.js`

### Public endpoints
- `GET /api/tools` - tool metadata from tool HTML files
- `GET /api/wca/:wcaId/:event` - WCA profile-derived data
- `GET /api/version` - app version from `package.json`
- `GET /events` - event definitions for grouping tool

### Contact pipeline
- `POST /api/contact`
- `GET /contact/confirm?id=...`

Behavior:
- reCAPTCHA Enterprise verification
- message confirmation flow (double opt-in)
- pending message expiry cleanup
- ban/appeal handling

### Security and reliability
- Endpoint-specific rate limiting (`express-rate-limit`)
- Input sanitization (`sanitize-html`)
- CORS allowlist handling
- Trust proxy enabled for accurate `req.ip`
- Structured JSON request logging

## Local Development

1. Clone the repository.
```bash
git clone https://github.com/s-kling/cubingtools.de.git
cd cubingtools.de
```

2. Install dependencies.
```bash
npm install
```

3. Configure backend ports in `backend/config.json`.

4. Create backend env file.
File: `backend/.env`

5. Start app with helper script.
```bash
./bin/start.sh
```

The script supports production (`8000`), beta (`8001`), or both.

### NPM scripts
```bash
npm run start   # starts ./bin/start.sh
npm run beta    # node backend/server.js --beta
npm run dev     # node backend/server.js --beta --debug
npm run debug   # node inspect backend/server.js
npm test        # node --test backend/tests/*.test.js
```

## Environment Variables

Configured in `backend/.env`.

Commonly used variables:
- `STATUS_PAGE_PASSWORD` (SHA-256 hash expected by admin auth)
- `EMAIL_HOST`
- `EMAIL_USER`
- `EMAIL_PASSWORD`
- `EMAIL_RECEIVER`
- `CONTACT_API_PASSWORD`
- `GOOGLE_APPLICATION_CREDENTIALS`
- `RECAPTCHA_PROJECT_ID`
- `RECAPTCHA_SITE_KEY`
- `RECAPTCHA_ACTION`
- `CORS_WHITELIST` (optional comma-separated override)

## Usage

1. Open the site and pick a tool from sidebar or homepage carousel.
2. For WCA-backed tools, provide a valid WCA ID (format like `2023ABCD01`).
3. Use URL-sharing where supported (notably Guildford and Grouping workflows).
4. For admin tasks, sign in at `/admin` and continue to status/messages/todo pages.

## Contributing

1. Fork and create a feature branch.
2. Implement and test changes.
3. Open a pull request with a clear summary of behavior changes.

## License

MIT License.
