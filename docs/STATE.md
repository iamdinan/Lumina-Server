# STATE.md (Backend)

_Last updated: session where the docs themselves were split into
frontend/backend versions. No backend code changed in that session._

## What's done

- Postgres schema: `series`, `seasons`, `episodes`, `users`, `user_series`,
  `user_episodes` — normalized, FKs with `ON DELETE CASCADE`.
- `episodes.runtime_minutes` added (manual migration) and wired into the
  TMDB import upsert.
- `users` extended with `full_name`, `email` (unique), `country`, `birthday`
  — nullable, filled in later via `PATCH /users/me` rather than at signup.
- Endpoints implemented:
  - Health check
  - TMDB search, popular, top-rated, airing-today, on-the-air, import (transactional upsert)
  - Register, login, get-me, update-profile, watch stats
  - Watchlist CRUD (add/update-status/list/remove), get-status, progress
  - Mark/unmark watched, bulk mark-completed
- Global error handling (`AppError` + `errorHandler` + `asyncHandler`) — all
  controllers refactored to this pattern.
- Input validation (`express-validator`) on every route taking params/body.
- Security: `helmet`, CORS locked to `FRONTEND_URL`, rate limiting on
  `/register` and `/login` only.
- Automatic status state machine implemented in
  `recalculateSeriesStatus` (`userEpisodes.controller.js`) — see
  DECISIONS.md #011 for the exact rules.

## Known issues / unconfirmed

- **Watch-time stats reported as "not working"** by the user after
  implementation. Debugging steps given (check `runtime_minutes` actually
  backfilled post-re-import; curl `/api/users/me/stats` directly to see raw
  response/status) but **no confirmation of root cause or fix was received
  in-session.** Re-check this before trusting the stats endpoint.
- **Episode mark-watched appeared broken, then turned out to be a frontend
  checkbox rendering issue, not a backend bug** — but this was during the
  same period the status-machine code (with new `AppError` usage in
  `userEpisodes.controller.js`) was added. Worth re-confirming
  `markWatched`/`unmarkWatched` behave correctly end-to-end, including the
  `AppError` import actually being present in that file (was called out as
  a likely silent-500 cause if missing).
- **Profile columns depend on the manual migration having been fully
  applied** — walked through step-by-step (including a moment of confusion
  around an "add new schema" prompt in the VS Code extension, correctly
  identified as irrelevant/dismissable), but not re-verified with a direct
  `SELECT` afterward in-session. Confirm the four columns exist and
  `updateProfile`/`getMe` return them before building more on top of
  profile data.

## Explicitly not started

- No migration tooling (manual `.sql` files only) — see DECISIONS.md #009.
- No rewatch tracking — see DECISIONS.md #012.
- No refresh-token flow (flat 7-day JWT only).
- No automated tests of any kind.
- No deployment/hosting configured.
- No pagination on TMDB search results (relies on TMDB's single default
  page, ~20 results).

## Session log

**Latest session (docs split into frontend/backend, no code changes):**
Re-organized `AGENTS.md`/`ARCHITECTURE.md`/`STATE.md`/`DECISIONS.md` into
separate frontend and backend versions at the user's request. No backend
behavior touched — the three open issues above (stats, checkbox/mark-watched,
profile columns) remain exactly as before and should be the first thing
checked in the next working session.

**Current session:** Added TMDB browse endpoints for top rated, airing today,
and on the air series, alongside the existing popular browse route. The API
surface now mirrors TMDB's main TV discovery categories.

**Prior session:** Implemented the watchlist/watching/completed automatic
state machine end-to-end (`recalculateSeriesStatus`, `getSeriesStatus`
endpoint, `mark-completed` bulk endpoint). Coincided with the frontend
reporting checkboxes becoming unclickable and stats not working — not
conclusively resolved before the session ended.

**Prior session:** Added `runtime_minutes` and the four profile columns via
manual migration; built `PATCH /users/me` and `GET /users/me/stats`.

**Earlier sessions:** Initial schema design and iteration; scaffolded
Express app (DB pool, TMDB service, search/import, auth, watchlist CRUD,
mark/unmark watched, progress endpoint); added centralized error handling
and input validation; added rate limiting, helmet, CORS lockdown, `/me`
endpoint, and pagination groundwork on `listSeries`.
