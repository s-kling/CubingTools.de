# Backend architecture

```
                         ┌─────────────────────────────── reverse proxy (nginx/Caddy) ──┐
 browser ──── HTTPS ───▶ │  /api/*  /contact/confirm  /newsletter/*   ─────────────┐     │
                         │  everything else ─────────────────────┐                 │     │
                         └───────────────────────────────────────┼─────────────────┼─────┘
                                                                 ▼                 ▼
                                              ┌────────────────────────┐   ┌──────────────────────────┐
                                              │ web  (N workers)       │   │ logic (N workers)        │
                                              │ static files, HTML,    │──▶│ REST API, admin, contact,│
                                              │ /events, /api/tools    │   │ newsletter endpoints     │
                                              │ bounded API proxy      │   │  └─ worker_threads pool  │
                                              └────────────────────────┘   │     (SQL + Monte-Carlo)  │
                                                                           └────────────┬─────────────┘
                                                                                        │ reads (SQLite, read-only)
 ┌───────────────────────────────────────────────────────────┐                          ▼
 │ jobs (exactly 1)                                          │   wca_export/current.json ─▶ wca-<version>.db
 │  • WCA export download → build DB → atomic publish ───────┼──▶ wca_export/live.db (upcoming competitions)
 │  • competition sync                                       │   wca_export/control/{status.json,*.request}
 │  • newsletter: detect → outbox → pooled SMTP dispatch     │
 └──────────────────────────────┬────────────────────────────┘
                                ▼
                   Firestore (subscribers, outbox, reminders, users)
```

## Why three roles

| Role | Does | Must never |
|------|------|------------|
| **web** | HTML/CSS/JS/assets, tiny cached JSON endpoints, forwards `/api/*` | touch Firestore, SQLite, SMTP, bcrypt, WCA data |
| **logic** | all API endpoints; CPU/SQL-heavy work goes to a `worker_threads` pool | serve static pages, run periodic jobs |
| **jobs** | WCA import, competition sync, newsletter scheduling and delivery | handle HTTP requests |

A slow API call (e.g. analysing a 300-person round, a hung TNoodle, a stalled Firestore read) occupies a
logic worker or a proxy socket – it can no longer delay a page view. Page serving also survives the logic
tier being down (`/api/tools`, `/events`, every page still work; API calls get a fast 502/503/504).

## Running

```bash
npm start                       # bin/start.sh – all three roles, interactive
node backend/server.js --beta   # all three roles under a tiny restarting launcher
node backend/server.js --only=web,logic     # e.g. on a second machine without jobs
npm run web | logic | jobs      # one role per systemd unit / container
```

`config.json` keys (all optional, see `backend/lib/config.js`): `web_workers`, `logic_workers` (0 = auto),
`logic_prod_port` (8100), `logic_beta_port` (8101), `proxy_max_inflight`, `proxy_timeout_ms`, `cpu_pool_size`,
`newsletter.{batch_size,max_connections,rate_per_second,max_attempts}`.
Env: `LOGIC_URL` (web → logic address), `LOGIC_HOST` (bind address, default `127.0.0.1`), `SESSION_SECRET`,
`WCA_EXPORT_DIR`, `RATE_LIMIT=off` (local dev only).

### Recommended reverse-proxy routing (optional)

The web tier proxies the API itself, so existing single-port setups keep working unchanged. For the lowest
overhead route the API straight to the logic tier and keep `X-Forwarded-For` intact:

```nginx
location ~ ^/(api/|contact/confirm|newsletter/) { proxy_pass http://127.0.0.1:8100; proxy_buffering off;
                                                  proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; }
location /                                       { proxy_pass http://127.0.0.1:8000;
                                                  proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; }
```

## Scaling notes

* **Workers** share nothing in memory that matters: admin sessions are signed stateless tokens; rate-limit
  counters and the log writer live in the cluster primary (IPC); the WCA DB is read-only SQLite (any number of
  readers, in any process). Add workers with `web_workers` / `logic_workers`.
* **WCA data** is published as an immutable `wca-<version>.db` plus an atomically replaced `current.json`.
  Readers notice the new pointer within 2 s and switch handles; there is no lock, no downtime, and a failed or
  cancelled import leaves the previous version live. Old versions beyond the newest two are pruned.
* **Newsletter** is an outbox (`newsletter_outbox`): one item per (competition, subscriber) with a deterministic
  id (`comp_<id>_<token>`), created with *create-if-absent*, so enqueueing is idempotent. A dispatcher claims
  items by pushing `nextAttemptAt` into the future (visibility timeout), sends over a pooled SMTP connection set,
  and then clears the field. Failures retry with exponential backoff + jitter (1 m … 6 h) and become `dead`
  after `max_attempts`, or immediately on recipient-specific rejects (550/551/553/554). A crash mid-batch
  re-delivers only unfinished items after the 5-minute lock expires. Unsubscribed users are skipped at send time.
* **Load shedding** instead of queueing forever: the proxy caps in-flight API requests (503), enforces a
  time-to-first-byte timeout (504) and the worker pool has a bounded queue.

## Operational notes

* Firestore: no composite index is needed (the outbox query uses a single field).
* The first export import (or an import after upgrading) needs ~6 GB free disk and a few minutes; until it
  finishes WCA endpoints answer `503` with a `Retry-After` header. The old `wca_export/wca.db*` is no longer
  used and can be deleted afterwards.
* Admin → "update WCA data" now writes a request file that the jobs process picks up (≤ 2 s); progress and the
  last error appear in `/api/admin/wca-metadata` (`refreshState`, `refreshProgress`, `lastError`).
