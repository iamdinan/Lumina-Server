# DECISIONS.md (Backend)

Lightweight ADR log. Each entry: what was decided, alternatives considered,
why. Newest at the bottom. If a later decision reverses an earlier one,
don't delete the old entry — add a new one that supersedes it and
cross-reference.

---

### 001 — Raw SQL over an ORM

**Decision:** Use the `pg` driver with hand-written parameterized SQL, no
ORM (Prisma/Sequelize/Knex).

**Alternatives considered:** Prisma (type-safe, built-in migrations), Knex
(query builder + migrations).

**Reasoning:** Schema is small (6 tables) and stable. An ORM adds a
dependency and a learning curve for a "simple now, scale later" project
where raw SQL stays understandable end-to-end. Revisit if schema/query
complexity grows, or if manual-migration pain (#009) becomes too costly.

---

### 002 — Composite PK on `user_series`, surrogate key on `user_episodes`

**Decision:** `user_series` uses composite PK `(user_id, series_id)`.
`user_episodes` uses a surrogate `watch_id SERIAL PRIMARY KEY` plus
`UNIQUE(user_id, episode_id)`, instead of a composite PK.

**Alternatives considered:** Composite PK on both tables. Fully
event-sourced `watch_events` table from day one.

**Reasoning:** `user_series` has no foreseeable need for multiple rows per
user+series. `user_episodes` might, later, for rewatch tracking — a user
watching the same episode more than once. A surrogate key now costs
nothing and lets rewatch support be added later by simply dropping the
`UNIQUE` constraint, with zero migration. A composite PK would require a
real migration (drop PK, add surrogate key, backfill) to support that
later. See #012 — rewatch is still not implemented; this is future-proofing
only.

---

### 003 — `password_hash` naming, not `password`

**Decision:** Column is `password_hash`, never `password`, even though a
raw password is never stored.

**Reasoning:** Defensive naming — avoids future confusion or bugs from
someone assuming `password` might hold plaintext; makes hashing intent
explicit at the schema level.

---

### 004 — Cache TMDB metadata locally instead of fetching live every time

**Decision:** `series`/`seasons`/`episodes` store a local copy of TMDB data
(name, poster path, air date, runtime, etc.), refreshed via
`ON CONFLICT DO UPDATE` on re-import, with `last_synced_at` on `series`.

**Alternatives considered:** Fetch from TMDB live on every request, no
local caching.

**Reasoning:** Avoids an N+1 problem (every progress bar/poster render
would otherwise need a live TMDB call) and avoids full dependency on
TMDB's uptime/rate limits for basic browsing. Trade-off: data can go stale
between re-imports — acceptable since series metadata changes
infrequently and re-import is a cheap, explicit (if currently manual)
action.

---

### 005 — Global error handling via `AppError` + `asyncHandler` + middleware

**Decision:** All controllers wrapped in `asyncHandler`, throw
`AppError(statusCode, message)` for deliberate errors; a single
`errorHandler` middleware translates errors (including known Postgres
codes like `23505`/`23503`) into consistent JSON.

**Alternatives considered:** Manual try/catch + `res.status().json()`
repeated per controller (the original pattern, before refactor).

**Reasoning:** Removes repeated boilerplate, guarantees the client never
sees a raw stack trace, and centralizes DB-error → HTTP-error mapping in
one place instead of reimplementing it per route.

---

### 006 — CORS locked to a single `FRONTEND_URL`, not wide open

**Decision:** `cors({ origin: process.env.FRONTEND_URL, credentials: true })`
instead of an unrestricted `cors()`.

**Reasoning:** Basic hardening step with near-zero cost — done early
alongside `helmet` and auth rate limiting rather than deferred, since it's
a one-line change and there's no reason to accept cross-origin requests
from arbitrary sites in a personal-project-turned-real-app.

---

### 007 — Rate limiting scoped to `/register` and `/login` only

**Decision:** `express-rate-limit` (10 requests / 15 min per IP) applied
only to the two auth routes, not globally.

**Alternatives considered:** Global rate limiter across all routes.

**Reasoning:** Auth routes are the brute-force target worth protecting
immediately. A global limiter would also throttle TMDB search/import
traffic, which is a different concern with different acceptable volume —
deferred as a separate, more generous limiter to add later if abuse is
observed, rather than bundled in now.

---

### 008 — Registration stays minimal; extended profile fields added later

**Decision:** `POST /users/register` only ever requires `username` +
`password`. `full_name`, `email`, `country`, `birthday` were added to
`users` later as nullable columns, editable via `PATCH /users/me`.

**Alternatives considered:** Require all fields at registration.

**Reasoning:** A long signup form adds friction before someone's tried the
app. Minimal registration + optional later profile completion was chosen
deliberately over forcing it upfront.

---

### 009 — No migration tool; manual, hand-numbered `.sql` files

**Decision:** Schema changes are standalone `.sql` files, run manually
against Postgres via the VS Code Postgres extension. No `node-pg-migrate`,
Knex migrations, or similar.

**Reasoning:** At current scale (single developer, small schema), a
migration framework adds setup overhead without near-term payoff.
Convention of never editing an already-applied migration file is followed
by discipline, not tooling enforcement — flagged to revisit if the project
grows.

---

### 010 — Watch-time stats computed live, never stored

**Decision:** `GET /users/me/stats` computes `COUNT`/`SUM(runtime_minutes)`
over `user_episodes JOIN episodes` on every request. No
`total_watch_minutes`-style column exists on `users`.

**Alternatives considered:** Maintain a running total on `users`, updated
on every mark/unmark/bulk-complete/remove.

**Reasoning:** A stored running total requires perfectly synchronized
increment/decrement logic across every mutation path — any missed path
silently corrupts the total with no easy way to detect it. Computing live
avoids that entire bug class at an acceptable performance cost for current
data volumes. Revisit only if this becomes a measured performance problem.

---

### 011 — Automatic watchlist/watching/completed state machine, server-side

**Decision:** Status transitions are fully automatic, enforced entirely in
the backend (`recalculateSeriesStatus`, `userEpisodes.controller.js`):

- Add to list → always starts at `watchlist`.
- Toggling "add" again while already listed removes the row entirely (no
  manual status picker for this specific action).
- Marking any episode watched → status becomes (at least) `watching`.
- All episodes watched → `completed`.
- Unmarking an episode on a `completed` series → recalculates, can drop
  back to `watching`.
- Removing a series while `watching`/`completed` cascades: deletes all of
  that user's `user_episodes` rows for that series first, then the
  `user_series` row — watch history and derived stats (#010) disappear
  together, no orphaned rows survive.
- A separate `mark-completed` bulk endpoint ticks every episode watched in
  the DB at once and forces `status = 'completed'`, rather than requiring
  the user to check every box individually.

**Alternatives considered:** Manual-only status setting via a dropdown, no
automatic inference. Computing status transitions on the frontend instead.

**Reasoning:** Manual-only status doesn't match how people actually use a
tracker — nobody remembers to flip a dropdown the moment they start
watching. Server-side computation keeps the frontend a thin reflection of
server state rather than duplicating transition rules client-side, which
risks client/server disagreement.

**Status:** Implemented, but see STATE.md — end-to-end confirmation
(especially interactions with the mark-watched checkbox and bulk-complete
UI refresh) was not fully closed out as of the last session touching this
code.

---

### 012 — Rewatch tracking intentionally not implemented

**Decision:** `user_episodes` allows exactly one watched record per
`(user_id, episode_id)` via a `UNIQUE` constraint. No watch-count or
watch-event-history feature exists.

**Reasoning:** Out of scope for the current MVP. The surrogate-key design
(#002) deliberately leaves room to add this later by relaxing the
constraint, without a schema migration at that point. Not building it now
is a scope decision, not a technical limitation.

---

### 013 — TMDB browse routes stay as thin pass-throughs

**Decision:** Expose TMDB discovery categories directly through
`/api/series/popular`, `/top-rated`, `/airing-today`, and `/on-the-air` as
thin backend pass-throughs.

**Alternatives considered:** Fetch only popular series, or merge TMDB browse
categories into a single endpoint with a query parameter.

**Reasoning:** The frontend already treats these as separate browse tabs, so
keeping them as distinct routes keeps the API explicit and avoids extra
branching on the client. Each endpoint remains a simple, cache-free TMDB
proxy, matching the existing popular-series behavior.
