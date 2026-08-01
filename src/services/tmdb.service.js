const axios = require("axios");
require("dotenv").config();

const tmdb = axios.create({
  baseURL: process.env.TMDB_BASE_URL,
  params: { api_key: process.env.TMDB_API_KEY },
});

async function searchSeries(query) {
  const res = await tmdb.get("/search/tv", { params: { query } });
  return res.data.results;
}

async function getSeriesDetails(tmdbId) {
  const res = await tmdb.get(`/tv/${tmdbId}`);
  return res.data;
}

async function getSeasonDetails(tmdbId, seasonNo) {
  const res = await tmdb.get(`/tv/${tmdbId}/season/${seasonNo}`);
  return res.data;
}

async function getPopularSeries() {
  const res = await tmdb.get("/tv/popular");
  return res.data.results;
}

async function getTopRatedSeries() {
  const res = await tmdb.get("/tv/top_rated");
  return res.data.results;
}

async function getAiringTodaySeries() {
  const res = await tmdb.get("/tv/airing_today");
  return res.data.results;
}

async function getOnTheAirSeries() {
  const res = await tmdb.get("/tv/on_the_air");
  return res.data.results;
}

module.exports = {
  searchSeries,
  getSeriesDetails,
  getSeasonDetails,
  getPopularSeries,
  getTopRatedSeries,
  getAiringTodaySeries,
  getOnTheAirSeries,
};
