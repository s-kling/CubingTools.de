# CubingTools.de Backend Documentation

This document describes the current backend behavior for version `1.2.6`, including routing, API endpoints, authentication, moderation, and operational notes.

## Architecture Overview

Main entry point:
- `backend/server.js`

Route modules:
- `backend/API/routes.js` (public pages and tool/static route handling)
- `backend/API/api.js` (public APIs, admin APIs, contact flow)
- `backend/API/tools.js` (tool metadata discovery)
- `backend/API/admin-routes.js` (admin HTML pages)

The server:
- serves static files from `public/`
- applies JSON/urlencoded body parsing with configured size limits
- sanitizes string fields in request bodies
- enforces CORS allowlist policy
- logs requests as JSON lines in `backend/log/server.log` or `backend/log/beta.log`

## Dependencies (Backend-Critical)

- `express`
- `axios`
- `express-rate-limit`
- `sanitize-html`
- `nodemailer`
- `bcrypt`
- `@google-cloud/recaptcha-enterprise`
- `firebase` / `firebase-admin` (via `backend/firebase.js`)
- `dotenv`

## Data Storage

- **Users**: Firestore `users` collection
- **Messages**: Firestore `messages` collection
- **Tasks**: Firestore `tasks` collection
- **Task completions**: Firestore `taskCompletions` collection
- **Bans**: `backend/API/mail/bans.json`
- **Config**: `backend/config.json`

## Authentication Model (Admin)

Admin endpoints use bearer token authentication with per-user bcrypt-hashed passwords.

Flow:
1. `POST /api/admin/login` with `username` and `password` in body.
2. Server loads the user from Firestore and compares the password using bcrypt.
3. On success, server returns a session token, the user's role, and whether a password change is required.
4. Client sends `Authorization: Bearer <token>` for protected endpoints.
5. Token validity can be checked with `GET /api/admin/verify`.

Session notes:
- Sessions are stored in memory.
- Default session TTL is 8 hours.

### Roles

Three roles control access to protected endpoints:
- `admin` — full access to all endpoints
- `operator` — access to moderation, messages, bans, tasks, status, and TODOs
- `tester` — read-only access to status, TODOs, and tasks

Middleware guards:
- `requireAuth` — any authenticated user
- `requireAdmin` — admin role only
- `requireOperatorOrAdmin` — admin or operator roles

## Public API Endpoints

### `GET /api/wca/:wcaId/:event`

Returns WCA-derived competitor data.

Path parameters:
- `wcaId` (example: `2023ABCD01`) — validated against format `YYYYAAAA00`
- `event` (example: `333`, or `name` for competitor name)

Query parameters:
- `num` (optional, default 12, max 200)
- `getsolves=true` returns full solves payload
- `getaverages=true` returns event average history

Default response shape:
- `{ average, records }`

Behavior notes:
- Fetches from the official WCA API v0 (`worldcubeassociation.org/api/v0/persons`).
- Responses are cached in memory for 5 minutes.
- Deduplicates in-flight requests for same WCA ID.

### `GET /api/scramble/:event`

Generates scrambles for a WCA event via a local TNoodle server.

Path parameters:
- `event` — one of: `222`, `333`, `444`, `555`, `666`, `777`, `333bf`, `333oh`, `clock`, `minx`, `pyram`, `skewb`, `sq1`, `444bf`, `555bf`

Query parameters:
- `count` (optional, default 1, max 50)

Response shape:
- `{ event, scrambles }`

Behavior notes:
- Proxies to a TNoodle JAR running on `localhost:2014` (configurable via `TNOODLE_URL`).
- WCA event IDs are mapped to TNoodle puzzle keys (e.g. `333bf` → `333ni`).
- Single-scramble requests use a one-ahead prefetch cache for instant responses.
- Multi-scramble requests bypass the cache and fetch directly.

### `GET /api/tools`

Returns tool metadata derived from HTML files in `public/tools/*/*.html`.

Response items include:
- `filename`
- `title`
- `description`
- `slogan`
- `keywords`

### `GET /api/version`

Returns application version from `package.json`:
- `{ version: "1.2.6" }`

### `GET /events`

Returns event definitions used by the grouping tool:
- `{ events: [...] }`

## Contact and Confirmation Endpoints

### `POST /api/contact`

Accepts contact form submissions and appeal submissions.

Expected body fields:
- `name` (max 100 characters)
- `email` (max 320 characters)
- `message` (max 5000 characters)
- `tool` (optional, max 100 characters)
- `visits` (optional)
- `isAppeal` (optional boolean-like)
- `g-recaptcha-response` or `recaptchaToken`

Behavior:
- Validates required fields and field length limits.
- Validates email format.
- Performs ban checks (email + hashed IP).
- Emails ending in `@cubingtools.de` are automatically banned.
- Verifies reCAPTCHA Enterprise when credentials are configured.
- For regular contact messages, sends confirmation email and stores message as unconfirmed in Firestore.
- For appeals, stores appeal state against matching ban entry.

### `GET /contact/confirm?id=<token>`

Confirms a pending message and forwards it to destination email inbox.

Redirect behavior:
- valid token -> `/contact?status=confirmed`
- invalid/expired token -> `/contact?status=invalid`

## Admin API Endpoints (Protected)

All endpoints below require `Authorization: Bearer <token>`.

### Auth

- `POST /api/admin/login`
  - body: `{ username, password }`
  - returns: `{ token, role, requiresPasswordChange }`
- `GET /api/admin/verify`
  - returns: `{ valid, role, username, color, requiresPasswordChange }`
- `POST /api/admin/change-password`
  - requires: any authenticated user
  - body: `{ newPassword }` (min 8 characters)

### User Management

- `GET /api/admin/users`
  - requires: operator or admin
  - returns list of users (passwords omitted)
- `GET /api/admin/users/names`
  - requires: any authenticated user
  - returns: `{ users: [{ username, color }] }`
- `POST /api/admin/users`
  - requires: admin
  - body: `{ username, role }` (role: `admin`, `operator`, or `tester`)
  - creates user with default password `cubingtools` and `firstLogin: true`
- `DELETE /api/admin/users/:username`
  - requires: admin
  - cannot delete own account; invalidates deleted user's sessions
- `PATCH /api/admin/users/:username/role`
  - requires: admin
  - body: `{ role }` — cannot change own role
- `POST /api/admin/users/:username/reset-password`
  - requires: admin
  - resets password to default and sets `firstLogin: true`
- `PATCH /api/admin/users/me/color`
  - requires: any authenticated user
  - body: `{ color }` (6-digit hex, e.g. `#FF0000`)
- `PATCH /api/admin/users/:username/color`
  - requires: admin
  - body: `{ color }` (6-digit hex)

### Status

- `POST /api/admin/status`
  - requires: any authenticated user

Returns:
- uptime
- memory usage
- log file size
- aggregated log analytics
- flattened log entries for UI filtering

### Config

- `GET /api/admin/config/error-rate-threshold`
  - requires: any authenticated user
  - returns: `{ threshold }`
- `PATCH /api/admin/config/error-rate-threshold`
  - requires: admin
  - body: `{ threshold }` (number 0–25)

### TODO Management

- `GET /api/admin/todos`
  - requires: any authenticated user
  - reads `md/TODO.md`
- `POST /api/admin/todos`
  - requires: any authenticated user
  - writes full TODO content

### Task Management

- `GET /api/admin/tasks`
  - requires: any authenticated user
  - returns task definitions from Firestore, enriched with live `applicable` status based on data conditions (`hasPendingMessages`, `hasMessages`, `hasBans`)
- `GET /api/admin/tasks/completions`
  - requires: any authenticated user
  - returns all completion history for all tasks
- `POST /api/admin/tasks/:taskId/complete`
  - requires: any authenticated user
  - records a task completion for the authenticated user (keeps max 100 entries per task)

### Message Moderation

- `GET /api/admin/messages`
  - requires: operator or admin
  - returns `{ messages, bans }`
- `DELETE /api/admin/messages/:id`
  - requires: admin
  - deletes a message by ID
- `PATCH /api/admin/messages/:id/assign`
  - requires: operator or admin
  - body: `{ assignedTo }` — username or empty to unassign
- `PATCH /api/admin/messages/:id/done`
  - requires: operator or admin
  - body: `{ done }` — only admin or assigned user can mark done

### Ban Management

- `GET /api/admin/messages/bans`
  - requires: operator or admin
- `POST /api/admin/messages/ban`
  - requires: operator or admin
  - body: `{ type: "email"|"ip", value, reason }`
  - ban entries record the acting user's username
- `POST /api/admin/messages/unban`
  - requires: operator or admin
  - body: `{ type: "email"|"ip", value }`

### Appeal Resolution

- `POST /api/admin/messages/appeal/resolve`
  - requires: operator or admin
  - body: `{ type, value, unban, reason }`

Behavior:
- resolves pending appeal
- optionally removes ban (`unban=true`)
- sends approval/denial email to appeal requester

## Admin Page Routes

Served by `backend/API/admin-routes.js`:

- `GET /admin`
- `GET /admin/status`
- `GET /admin/messages`
- `GET /admin/dev-todo`
- `GET /admin/users`

## Public Page and Asset Routes

Served by `backend/API/routes.js`:

- `GET /`
- `GET /privacy-policy`
- `GET /contact`
- `GET /contact/appeal`
- `GET /404`
- `GET /robots.txt`
- `GET /sitemap.xml`
- `GET /apple-touch-icon.png`
- `GET /apple-touch-icon-precomposed.png`
- `GET /googlea20166777fc211f6.html`
- `GET /.well-known/*` (returns `204`)

Tool and resource routes:
- `GET /tools/:toolName`
- `GET /css/:cssName`
- `GET /js/:jsName`
- `GET /assets/:assetName`

Catch-all:
- `GET *` serves 404 page

## Rate Limiting

The backend uses endpoint-specific limiters. Examples include:
- contact requests
- admin login and verification
- admin status and TODO operations
- admin message and ban operations
- admin password change
- admin user management (read and write)
- public WCA API requests
- public scramble requests

All rate-limit responses are JSON with an `error` message.

## Logging and Status Analytics

Request logs are written as JSON lines with:
- timestamp
- method
- URL
- status code
- duration
- user agent
- UTM source

Status analytics aggregate:
- total requests
- endpoint counts
- method counts
- status code counts
- status-code-to-URL maps
- user agent counts
- UTM source counts
- average response time per endpoint
- error rate (excludes 404s)
- peak traffic by UTC hour

## Required Environment Variables

Set in `backend/.env`:

- `EMAIL_HOST`
- `EMAIL_USER`
- `EMAIL_PASSWORD`
- `EMAIL_RECEIVER`
- `CONTACT_API_PASSWORD`
- `GOOGLE_APPLICATION_CREDENTIALS` (for reCAPTCHA Enterprise)
- `RECAPTCHA_PROJECT_ID`
- `RECAPTCHA_SITE_KEY`
- `RECAPTCHA_ACTION`
- `CORS_WHITELIST` (optional override)
- `TNOODLE_URL` (optional, default `http://localhost:2014`)

## Start Script (`bin/start.sh`)

The main entry point for local development and server operation.

### Prerequisites Check

On launch the script verifies required files exist:
- `backend/config.json`
- `backend/secret/` (must contain `service-account.json` and `users.json`)

If `node_modules` or `backend/log/` are missing, it offers to set them up interactively.

### Server Selection

Prompts the user to choose:
1. **Production** — runs on the port from `config.json` (`prod_port`)
2. **Beta** — runs on `beta_port` with the `--beta` flag

### TNoodle Integration

Automatically starts a TNoodle JAR (`bin/tnoodle.jar`) on port `2014` if:
- The JAR file exists
- Java is available
- The port is not already in use

Waits up to 30 seconds for TNoodle to become ready before proceeding.

### Control Loop

After startup the script opens the server URL in the default browser and enters an interactive loop:
- `r` — restart all (Node + TNoodle)
- `rn` — restart Node server only
- `rt` — restart TNoodle only
- `s` / `q` — stop all and exit
- `sn` — stop Node server only
- `st` — stop TNoodle only

## Notes

- If reCAPTCHA credentials are unavailable, the contact flow degrades gracefully and allows submission while logging warnings.
- Unconfirmed contact messages are automatically pruned after TTL expiry (1 hour).
- Bans are persisted in `backend/API/mail/bans.json`; messages are persisted in Firestore.
- Users, tasks, and task completions are stored in Firestore.
- New users are created with default password `cubingtools` and must change it on first login.

