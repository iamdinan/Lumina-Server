const tmdbService = require("../services/tmdb.service");
const pool = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

const search = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'Query param "q" is required' });
  }

  const results = await tmdbService.searchSeries(q);
  res.json(results);
});

const importSeries = asyncHandler(async (req, res) => {
  const { tmdbId } = req.params;

  // ---- STEP 1: Do ALL external TMDB calls first, with no DB connection open ----
  const seriesData = await tmdbService.getSeriesDetails(tmdbId);

  const seasonsWithEpisodes = await Promise.all(
    seriesData.seasons.map(async (season) => {
      const seasonDetails = await tmdbService.getSeasonDetails(
        tmdbId,
        season.season_number,
      );
      return { season, episodes: seasonDetails.episodes };
    }),
  );

  // ---- STEP 2: Now do a short, fast DB transaction with only writes ----
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Insert series (or get existing)
    const seriesResult = await client.query(
      `INSERT INTO series (tmdb_id, series_name, poster_path, status, last_synced_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (tmdb_id) DO UPDATE
         SET series_name = EXCLUDED.series_name,
             poster_path = EXCLUDED.poster_path,
             status = EXCLUDED.status,
             last_synced_at = NOW()
       RETURNING series_id`,
      [
        seriesData.id,
        seriesData.name,
        seriesData.poster_path,
        seriesData.status,
      ],
    );
    const seriesId = seriesResult.rows[0].series_id;

    // 2. Loop through seasons (data already fetched above)
    for (const { season, episodes } of seasonsWithEpisodes) {
      const seasonResult = await client.query(
        `INSERT INTO seasons (series_id, tmdb_season_id, season_no)
         VALUES ($1, $2, $3)
         ON CONFLICT (tmdb_season_id) DO UPDATE
           SET season_no = EXCLUDED.season_no
         RETURNING season_id`,
        [seriesId, season.id, season.season_number],
      );
      const seasonId = seasonResult.rows[0].season_id;

      // 3. Insert episodes for this season (data already fetched above)
      for (const ep of episodes) {
        await client.query(
          `INSERT INTO episodes (season_id, tmdb_episode_id, episode_no, episode_name, air_date, runtime_minutes)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (tmdb_episode_id) DO UPDATE
            SET episode_name = EXCLUDED.episode_name,
              air_date = EXCLUDED.air_date,
              runtime_minutes = EXCLUDED.runtime_minutes`,
          [
            seasonId,
            ep.id,
            ep.episode_number,
            ep.name,
            ep.air_date || null,
            ep.runtime || null,
          ],
        );
      }
    }

    await client.query("COMMIT");
    res.status(201).json({ message: "Series imported", series_id: seriesId });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

const getPopular = asyncHandler(async (req, res) => {
  const results = await tmdbService.getPopularSeries();
  res.json(results);
});

const getTopRated = asyncHandler(async (req, res) => {
  const results = await tmdbService.getTopRatedSeries();
  res.json(results);
});

const getAiringToday = asyncHandler(async (req, res) => {
  const results = await tmdbService.getAiringTodaySeries();
  res.json(results);
});

const getOnTheAir = asyncHandler(async (req, res) => {
  const results = await tmdbService.getOnTheAirSeries();
  res.json(results);
});

module.exports = {
  search,
  importSeries,
  getPopular,
  getTopRated,
  getAiringToday,
  getOnTheAir,
};
