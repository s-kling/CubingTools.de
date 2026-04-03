# CubingTools.de Backend Documentation

This document describes the current backend behavior for version `1.2.0`, including routing, API endpoints, authentication, moderation, and operational notes.

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
- `@google-cloud/recaptcha-enterprise`
- `dotenv`

## Authentication Model (Admin)

Admin endpoints use bearer token authentication.

Flow:
1. `POST /api/admin/login` with plain password in body.
2. Server compares SHA-256 hash of provided password against `STATUS_PAGE_PASSWORD` hash from env.
3. On success, server returns a session token.
4. Client sends `Authorization: Bearer <token>` for protected endpoints.
5. Token validity can be checked with `GET /api/admin/verify`.

Session notes:
- Sessions are stored in memory.
- Default session TTL is 8 hours.

## Public API Endpoints

### `GET /api/wca/:wcaId/:event`

Returns WCA-derived competitor data.

Path parameters:
- `wcaId` (example: `2023ABCD01`)
- `event` (example: `333`, or `name` for competitor name)

Query parameters:
- `num` (optional, default 12)
- `getsolves=true` returns full solves payload
- `getaverages=true` returns event average history

Default response shape:
- `{ average, records }`

Behavior notes:
- Uses cached upstream JSON snapshots.
- Deduplicates in-flight requests for same WCA ID.

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
- `{ version: "1.2.0" }`

### `GET /events`

Returns event definitions used by the grouping tool:
- `{ events: [...] }`

## Contact and Confirmation Endpoints

### `POST /api/contact`

Accepts contact form submissions and appeal submissions.

Expected body fields:
- `name`
- `email`
- `message`
- `tool` (optional)
- `visits` (optional)
- `isAppeal` (optional boolean-like)
- `g-recaptcha-response` or `recaptchaToken`

Behavior:
- Validates required fields.
- Performs ban checks (email + hashed IP).
- Verifies reCAPTCHA Enterprise when credentials are configured.
- For regular contact messages, sends confirmation email and stores message as unconfirmed.
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
- `GET /api/admin/verify`

### Status

- `POST /api/admin/status`

Returns:
- uptime
- memory usage
- log file size
- aggregated log analytics
- flattened log entries for UI filtering

### TODO Management

- `GET /api/admin/todos`
  - reads `md/TODO.md`
- `POST /api/admin/todos`
  - writes full TODO content

### Message Moderation

- `GET /api/admin/messages`
  - returns `{ messages, bans }`
- `DELETE /api/admin/messages/:id`
  - deletes a message by ID

### Ban Management

- `GET /api/admin/messages/bans`
- `POST /api/admin/messages/ban`
  - body: `{ type: "email"|"ip", value, reason }`
- `POST /api/admin/messages/unban`
  - body: `{ type: "email"|"ip", value }`

### Appeal Resolution

- `POST /api/admin/messages/appeal/resolve`
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
- public WCA API requests

All rate-limit responses are JSON with an `error` message.

## Logging and Status Analytics

Request logs are written as JSON lines with:
- timestamp
- method
- URL
- status code
- duration
- user agent

Status analytics aggregate:
- total requests
- endpoint counts
- method counts
- status code counts
- status-code-to-URL maps
- average response time per endpoint
- error rate
- peak traffic by UTC hour

## Required Environment Variables

Set in `backend/.env`:

- `STATUS_PAGE_PASSWORD` (SHA-256 hash string)
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

## Notes

- If reCAPTCHA credentials are unavailable, the contact flow degrades gracefully and allows submission while logging warnings.
- Unconfirmed contact messages are automatically pruned after TTL expiry.
- Bans are persisted in `backend/API/mail/bans.json`; messages are persisted in `backend/API/mail/mails.json`.

