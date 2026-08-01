# ARCHITECTURE.md (Backend)

## System role

The backend is the sole source of truth for anything user-specific (auth,
watchlist status, watched episodes, profile fields) and the sole caller of
TMDB. The frontend never calls TMDB directly except to hit its static image
CDN (`image.tmdb.org`) for poster rendering.

```
React SPA  ──HTTPS/JSON──►  Express API  ──┬──► PostgreSQL (users, series,
                                             │     seasons, episodes,
                                             │     user_series, user_episodes)
                                             └──► TMDB REST API (search,
                   series/season details,
                   popular, top-rated,
                   airing today, on the air)
```

## Folder breakdown

```
src/
  server.js                  # entrypoint — middleware registration, route mounting
  config/
    db.js                    # pg Pool instance, exported singleton
  routes/
    series.routes.js         # /api/series/* — search, popular, top-rated,
                             # airing-today, on-the-air, import
    users.routes.js          # /api/users/* — register, login, me, stats, profile
    userSeries.routes.js     # /api/users/me/series/* — watchlist CRUD, status, progress
    userEpisodes.routes.js   # /api/users/me/episodes/* — mark/unmark watched
  controllers/
    series.controller.js
    users.controller.js
    userSeries.controller.js
    userEpisodes.controller.js
  services/
    tmdb.service.js           # thin axios wrapper around TMDB endpoints
  middleware/
    auth.middleware.js         # requireAuth — verifies JWT, sets req.user
    error.middleware.js        # global error handler (registered last)
    validate.middleware.js      # runs express-validator's validationResult, throws AppError
    rateLimit.middleware.js      # authLimiter — applied only to /register, /login
  validators/
    series.validator.js
    users.validator.js
    userSeries.validator.js
    userEpisodes.validator.js
  utils/
    AppError.js                # custom error class carrying a statusCode
    asyncHandler.js             # wraps async route handlers, forwards rejections to next()
```

## Database schema (current)

```
series           series_id PK, tmdb_id UNIQUE, series_name, poster_path,
                  status, last_synced_at

seasons           season_id PK, series_id FK→series, tmdb_season_id UNIQUE,
                  season_no

episodes           episode_id PK, season_id FK→seasons, tmdb_episode_id
                    UNIQUE, episode_no, episode_name, air_date,
                    runtime_minutes

users               user_id PK, username UNIQUE, password_hash, created_at,
                    full_name, email UNIQUE, country, birthday
                    (full_name/email/country/birthday nullable — filled in
                    later via profile edit, not required at signup)

user_series          user_id FK→users, series_id FK→series, status
                     ('watchlist' | 'watching' | 'completed'), added_at
                     PK (user_id, series_id)

user_episodes          watch_id PK (surrogate), user_id FK→users, episode_id
                       FK→episodes, watched_at, UNIQUE(user_id, episode_id)
```

All FKs use `ON DELETE CASCADE`.

## Request lifecycle — key flows

**Search → import (TMDB → local cache)**

1. `GET /api/series/search?q=...` → `tmdb.service.searchSeries` → returns
   raw TMDB results, nothing written to DB.
2. `GET /api/series/popular`, `/top-rated`, `/airing-today`, `/on-the-air`
   → direct TMDB browse passthroughs, nothing written to DB.
3. `POST /api/series/:tmdbId/import` → fetches full series + season +
   episode details from TMDB inside a single Postgres transaction, upserts
   into `series` → `seasons` → `episodes` (`ON CONFLICT DO UPDATE`, keyed on
   each table's `tmdb_*_id`), returns the internal `series_id`.

**Watch-status state machine** (fully server-side, see DECISIONS.md #011)

- `POST /users/me/series/:seriesId` inserts `user_series` with
  `status = 'watchlist'` (`ON CONFLICT DO NOTHING`).
- `POST /users/me/episodes/:episodeId` (mark watched): looks up the episode's
  series, ensures a `user_series` row exists, upserts the `user_episodes`
  row, then calls `recalculateSeriesStatus(userId, seriesId)`.
- `recalculateSeriesStatus` compares total vs. watched episode counts for
  that series and sets `status` to `completed` (all watched), `watching`
  (some watched), or leaves it alone (none watched).
- `DELETE /users/me/episodes/:episodeId` (unmark) re-runs the same
  recalculation — can drop a `completed` series back to `watching`.
- `POST /users/me/series/:seriesId/mark-completed` bulk-inserts
  `user_episodes` for every episode in the series and forces
  `status = 'completed'` directly.
- `DELETE /users/me/series/:seriesId` deletes all `user_episodes` rows for
  that user+series **before** deleting the `user_series` row, so watch
  history and derived stats disappear together — no orphaned watched rows
  survive removal.

**Watch-time stats**
`GET /users/me/stats` computes `COUNT(*)` and `SUM(runtime_minutes)` live via
a join across `user_episodes` and `episodes`, scoped to the current user, on
every call. No stored/cached total exists anywhere (see DECISIONS.md #010).

## Design reasoning

See `DECISIONS.md` for the numbered rationale behind: raw SQL vs. ORM, the
`user_episodes` surrogate-key choice, `password_hash` naming, caching TMDB
data locally, the global error-handling pattern, JWT-in-localStorage (a
frontend concern but decided jointly with this API's CORS setup), minimal
registration vs. later profile completion, manual migrations, live-computed
watch stats, the automatic status state machine, and the decision to leave
rewatch tracking unimplemented for now.
