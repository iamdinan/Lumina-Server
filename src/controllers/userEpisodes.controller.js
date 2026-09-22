const pool = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

async function recalculateSeriesStatus(userId, seriesId) {
  const counts = await pool.query(
    `SELECT
       COUNT(e.episode_id) AS total,
       COUNT(ue.episode_id) AS watched
     FROM episodes e
     JOIN seasons se ON se.season_id = e.season_id
     LEFT JOIN user_episodes ue ON ue.episode_id = e.episode_id AND ue.user_id = $1
     WHERE se.series_id = $2`,
    [userId, seriesId],
  );

  const { total, watched } = counts.rows[0];
  const newStatus =
    Number(watched) === Number(total) && Number(total) > 0
      ? "completed"
      : Number(watched) > 0
        ? "watching"
        : null;

  if (newStatus) {
    await pool.query(
      `UPDATE user_series SET status = $1 WHERE user_id = $2 AND series_id = $3`,
      [newStatus, userId, seriesId],
    );
  }
}

// POST /api/users/me/episodes/:episodeId
const markWatched = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { episodeId } = req.params;

  // Find the series this episode belongs to
  const seriesLookup = await pool.query(
    `SELECT se.series_id FROM episodes e
     JOIN seasons se ON se.season_id = e.season_id
     WHERE e.episode_id = $1`,
    [episodeId],
  );
  if (seriesLookup.rows.length === 0) {
    throw new AppError(404, "Episode not found");
  }
  const seriesId = seriesLookup.rows[0].series_id;

  await pool.query(
    `INSERT INTO user_episodes (user_id, episode_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, episode_id) DO UPDATE SET watched_at = NOW()`,
    [userId, episodeId],
  );

  // Ensure a user_series row exists (in case they watched without adding to watchlist first)
  await pool.query(
    `INSERT INTO user_series (user_id, series_id, status)
     VALUES ($1, $2, 'watching')
     ON CONFLICT (user_id, series_id) DO NOTHING`,
    [userId, seriesId],
  );

  await recalculateSeriesStatus(userId, seriesId);

  res.status(201).json({ episode_id: Number(episodeId), watched: true });
});

// DELETE /api/users/me/episodes/:episodeId
const unmarkWatched = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { episodeId } = req.params;

  const seriesLookup = await pool.query(
    `SELECT se.series_id FROM episodes e
     JOIN seasons se ON se.season_id = e.season_id
     WHERE e.episode_id = $1`,
    [episodeId],
  );
  const seriesId = seriesLookup.rows[0]?.series_id;

  const result = await pool.query(
    `DELETE FROM user_episodes WHERE user_id = $1 AND episode_id = $2 RETURNING *`,
    [userId, episodeId],
  );

  if (result.rows.length === 0) {
    throw new AppError(404, "Episode was not marked watched");
  }

  if (seriesId) {
    await recalculateSeriesStatus(userId, seriesId);
  }

  res.status(204).send();
});

// GET /api/users/me/series/:seriesId/progress
const getSeriesProgress = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { seriesId } = req.params;

  const result = await pool.query(
    `SELECT
         se.season_no,
         e.episode_id,
         e.episode_no,
         e.episode_name,
         e.air_date,
         (ue.episode_id IS NOT NULL) AS watched
       FROM episodes e
       JOIN seasons se ON se.season_id = e.season_id
       LEFT JOIN user_episodes ue
         ON ue.episode_id = e.episode_id AND ue.user_id = $1
       WHERE se.series_id = $2
       ORDER BY se.season_no, e.episode_no`,
    [userId, seriesId],
  );

  const totalEpisodes = result.rows.length;
  const watchedEpisodes = result.rows.filter((r) => r.watched).length;

  // Group by season for easier frontend rendering
  const seasonsMap = {};
  for (const row of result.rows) {
    if (!seasonsMap[row.season_no]) {
      seasonsMap[row.season_no] = { season_no: row.season_no, episodes: [] };
    }
    seasonsMap[row.season_no].episodes.push({
      episode_id: row.episode_id,
      episode_no: row.episode_no,
      episode_name: row.episode_name,
      air_date: row.air_date,
      watched: row.watched,
    });
  }

  res.json({
    series_id: Number(seriesId),
    total_episodes: totalEpisodes,
    watched_episodes: watchedEpisodes,
    seasons: Object.values(seasonsMap),
  });
});

const getWatchStats = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const result = await pool.query(
    `SELECT
       COUNT(*) AS episodes_watched,
       COALESCE(SUM(e.runtime_minutes), 0) AS total_minutes
     FROM user_episodes ue
     JOIN episodes e ON e.episode_id = ue.episode_id
     WHERE ue.user_id = $1`,
    [userId],
  );

  const { episodes_watched, total_minutes } = result.rows[0];
  const minutes = Number(total_minutes);
  const total_hours_raw = Math.floor(minutes / 60);

  const months = Math.floor(total_hours_raw / (24 * 30));
  const remaining_hours = total_hours_raw % (24 * 30);
  const days = Math.floor(remaining_hours / 24);
  const hours = remaining_hours % 24;

  res.json({
    episodes_watched: Number(episodes_watched),
    total_hours: hours,
    total_days: days,
    total_months: months,
  });
});

// GET /api/users/me/activity?year=YYYY
const getWatchActivity = asyncHandler(async (req, res) => {
  const [clockResult, daysResult] = await Promise.all([
    pool.query("SELECT TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') AS today"),
    pool.query(
      `SELECT TO_CHAR(watched_at::date, 'YYYY-MM-DD') AS date,
              COUNT(*)::int AS count
       FROM user_episodes
       WHERE user_id = $1 AND watched_at < CURRENT_DATE + INTERVAL '1 day'
       GROUP BY watched_at::date
       ORDER BY watched_at::date DESC`,
      [req.user.userId],
    ),
  ]);

  const today = clockResult.rows[0].today;
  const currentYear = Number(today.slice(0, 4));
  const year = req.query.year ? Number(req.query.year) : currentYear;
  const counts = new Map(daysResult.rows.map(({ date, count }) => [date, count]));
  const previousDay = (date) => {
    const day = new Date(`${date}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() - 1);
    return day.toISOString().slice(0, 10);
  };

  let streakDate = counts.has(today) ? today : previousDay(today);
  let currentStreak = 0;
  while (counts.has(streakDate)) {
    currentStreak += 1;
    streakDate = previousDay(streakDate);
  }

  const firstActivityYear = daysResult.rows.length
    ? Number(daysResult.rows.at(-1).date.slice(0, 4))
    : currentYear;
  const availableYears = Array.from(
    { length: currentYear - firstActivityYear + 1 },
    (_, index) => currentYear - index,
  );

  res.json({
    today,
    year,
    available_years: availableYears,
    current_streak: currentStreak,
    days: daysResult.rows.filter(({ date }) => Number(date.slice(0, 4)) === year),
  });
});

const markSeriesCompleted = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { seriesId } = req.params;

  // Insert a user_episodes row for every episode in this series that isn't already watched
  await pool.query(
    `INSERT INTO user_episodes (user_id, episode_id)
     SELECT $1, e.episode_id
     FROM episodes e
     JOIN seasons se ON se.season_id = e.season_id
     WHERE se.series_id = $2
     ON CONFLICT (user_id, episode_id) DO NOTHING`,
    [userId, seriesId],
  );

  // Ensure user_series exists, then force status to completed
  await pool.query(
    `INSERT INTO user_series (user_id, series_id, status)
     VALUES ($1, $2, 'completed')
     ON CONFLICT (user_id, series_id) DO UPDATE SET status = 'completed'`,
    [userId, seriesId],
  );

  res.status(200).json({ message: "Series marked as completed" });
});

module.exports = {
  markWatched,
  unmarkWatched,
  getSeriesProgress,
  getWatchStats,
  getWatchActivity,
  markSeriesCompleted,
};
