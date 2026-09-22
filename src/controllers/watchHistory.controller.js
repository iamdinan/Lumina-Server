const pool = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { toCsv } = require("../utils/csv");

const columns = [
  "username",
  "series_name",
  "tmdb_series_id",
  "current_series_status",
  "season_number",
  "episode_number",
  "episode_name",
  "tmdb_episode_id",
  "air_date",
  "runtime_minutes",
  "watched_at",
];

// GET /api/users/me/watch-history/export
const exportWatchHistory = asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT u.username,
            ue.watch_id,
            s.series_name,
            s.tmdb_id AS tmdb_series_id,
            us.status AS current_series_status,
            se.season_no AS season_number,
            e.episode_no AS episode_number,
            e.episode_name,
            e.tmdb_episode_id,
            TO_CHAR(e.air_date, 'YYYY-MM-DD') AS air_date,
            e.runtime_minutes,
            TO_CHAR(ue.watched_at, 'YYYY-MM-DD HH24:MI:SS') AS watched_at
     FROM users u
     LEFT JOIN user_episodes ue ON ue.user_id = u.user_id
     LEFT JOIN episodes e ON e.episode_id = ue.episode_id
     LEFT JOIN seasons se ON se.season_id = e.season_id
     LEFT JOIN series s ON s.series_id = se.series_id
     LEFT JOIN user_series us ON us.user_id = u.user_id AND us.series_id = s.series_id
     WHERE u.user_id = $1
     ORDER BY ue.watched_at DESC NULLS LAST, s.series_name, se.season_no, e.episode_no`,
    [req.user.userId],
  );

  if (result.rows.length === 0) {
    throw new AppError(404, "User not found");
  }

  const username = result.rows[0].username;
  const rows = result.rows
    .filter((row) => row.watch_id !== null)
    .map((row) => columns.map((column) => row[column]));
  const filename = `${username.replace(/[^a-zA-Z0-9_-]/g, "_")}_lumina_watch_history.csv`;

  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="${filename}"`);
  res.set("Cache-Control", "no-store");
  res.send(toCsv(columns, rows));
});

module.exports = { exportWatchHistory };
