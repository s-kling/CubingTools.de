# CubingTools.de Release Notes

## Version 1.2.0

Release date: 2026-04-03

## Overview
Version 1.2.0 is a major platform update focused on reliability, moderation tooling, and end-to-end workflow polish.

This release adds a full admin workflow (status analytics, message moderation, and TODO management), strengthens backend security/rate-limiting, expands the contact system with confirmation and appeal handling, and improves the frontend UX with shared error handling and feedback popups.

Package version is now `1.2.0`.

---

## Highlights

### 1. New Admin Console and Secure Session Flow
- Added a dedicated admin login flow with bearer-token session validation.
- Added protected admin routes and views:
    - `/admin/status`
    - `/admin/messages`
    - `/admin/dev-todo`
- Added auth endpoints:
    - `POST /api/admin/login`
    - `GET /api/admin/verify`
- Added separate endpoint-specific rate limits for login, verification, status, TODO, and moderation actions.

### 2. New Status Dashboard with Log Explorer
- Added a rich status dashboard backed by `POST /api/admin/status`.
- Dashboard now reports:
    - uptime
    - memory usage
    - log file size
    - request/error analytics
- Added interactive log exploration and filtering by:
    - endpoint
    - status code
    - method
    - user agent
    - peak hour and count limits
- Added detailed matching log-entry view for selected explorer rows.

### 3. New Message Moderation, Ban Management, and Appeals
- Added admin message center backed by `GET /api/admin/messages`.
- Added moderation actions:
    - delete message (`DELETE /api/admin/messages/:id`)
    - add ban (`POST /api/admin/messages/ban`)
    - remove ban (`POST /api/admin/messages/unban`)
    - resolve appeal (`POST /api/admin/messages/appeal/resolve`)
- Added ban list support for both:
    - email
    - hashed IP
- Added appeal lifecycle with pending appeal tracking and approval/denial handling.
- Added outbound appeal decision emails (approved/denied) via email template.

### 4. Contact System Upgrade (Security + Deliverability)
- Added stronger contact flow with:
    - Google reCAPTCHA Enterprise checks
    - endpoint rate limiting
    - sanitization of incoming string body fields
- Added double opt-in message confirmation:
    - submission stores pending payload
    - user confirms through `/contact/confirm?id=...`
    - only confirmed messages are forwarded to destination inbox
- Added automatic pruning of expired unconfirmed contact entries.
- Added explicit banned-sender handling and dedicated appeal submission UX (`/contact/appeal`).

### 5. Backend Hardening and API Improvements
- Added `trust proxy` support for correct client IP handling behind reverse proxy.
- Added configurable CORS whitelist with strict origin allow-list behavior.
- Added structured JSON request logging with duration and status metadata.
- Added improved WCA API wrapper behavior:
    - short-lived response caching
    - in-flight request de-duplication
    - unified solve/average/PR/name access patterns
- Kept the public API surface for tools and versioning:
    - `GET /api/tools`
    - `GET /api/wca/:wcaId/:event`
    - `GET /api/version`

### 6. Shared Frontend UX and Error Reporting
- Added unified popup system for user feedback and error states.
- Added deduped popup cooldown to prevent duplicate error spam.
- Added global runtime and unhandled-promise error capture with user-facing reporting links.
- Added shared `fetchJsonOrThrow` helper for consistent request/error handling across pages.
- Added pre-filled GitHub bug report links for fast issue reporting.

### 7. Homepage and Navigation Improvements
- Refreshed homepage hero and tool discovery flow.
- Added interactive tools carousel with:
    - ordered tool presentation
    - keyboard navigation
    - auto-rotation and hover pause
    - dynamic keyword pills
- Improved shared shell behavior in `setupPage.js`:
    - dynamic sidebar tool loading
    - version badge rendering from `/api/version`
    - responsive navbar/footer setup
    - beta/full-release switch shortcuts

### 8. Tool Suite Updates

#### Guildford Optimizer (`/public/tools/guildford`)
- Supports multiple relay presets including FTO variants.
- Supports custom relay composition and preset matching.
- Synchronizes full form state to URL and restores from URL.
- Uses WCA API data for event-name and solve/average lookups.
- Optimizes event splits while accounting for pickup time.

#### Grouping Tool (`/public/tools/grouping`)
- Loads canonical event definitions from `/events`.
- Adds searchable/selectable event tiles and custom event support.
- Supports dynamic vs fixed group sizing per event.
- Supports competitor sort strategies:
    - Round Robin
    - Linear
    - Random
- Supports helper-role planning (judges/runners/scramblers) and URL data restoration.

#### WCA Average Calculator (`/public/tools/average`)
- Tracks solves with penalties (`+2`, `DNF`) and live recalculation.
- Calculates and displays:
    - Ao5/Mo3
    - BPA/WPA
    - TFT (time for target)
- Integrates WCA solves/averages for comparative PR ranking.
- Persists tagged averages and session data in cookies per event.

#### GlobalCalc (`/public/tools/globalCalc`)
- Supports two data sources:
    - csTimer export upload
    - WCA solve fetch
- Adds solve-distribution charting with adjustable sample-size slider.
- Adds weighted prediction metrics including:
    - predicted global average
    - average deviation
    - best rolling average
    - probability of beating best average (simulation-based)

### 9. Privacy and Legal Content
- Privacy page now supports selectable historical policy versions.
- Terms are now versioned and available through the same selector flow.
- Latest published documents in this release:
    - Privacy policy: `2026-03-31`
    - Terms and conditions: `2026-04-02`

---

## Developer Notes

- Main runtime dependencies now include:
    - `express`
    - `express-rate-limit`
    - `sanitize-html`
    - `nodemailer`
    - `@google-cloud/recaptcha-enterprise`
    - `axios`
- App version endpoint is now aligned directly with `package.json` version (`1.2.0`).

---

## Conclusion
Version 1.2.0 transitions CubingTools.de from a tool collection to a more complete platform with admin observability, moderation controls, safer contact operations, and stronger UX consistency across pages.