const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/db");
const { exportWatchHistory } = require("../src/controllers/watchHistory.controller");

function requestExport(rows) {
  pool.query = async (sql, params) => {
    assert.match(sql, /JOIN user_episodes/);
    assert.match(sql, /JOIN episodes/);
    assert.match(sql, /JOIN seasons/);
    assert.match(sql, /JOIN series/);
    assert.match(sql, /JOIN user_series/);
    assert.deepEqual(params, [7]);
    return { rows };
  };

  const headers = {};
  return new Promise((resolve, reject) => {
    exportWatchHistory(
      { user: { userId: 7 } },
      {
        set: (name, value) => { headers[name] = value; },
        send: (body) => resolve({ headers, body }),
      },
      reject,
    );
  });
}

test("exports only the authenticated user's joined watch rows as safe CSV", async () => {
  const originalQuery = pool.query;
  try {
    const { headers, body } = await requestExport([{
      username: "alice",
      watch_id: 1,
      series_name: 'A, "Series"',
      tmdb_series_id: 42,
      current_series_status: "watching",
      season_number: 1,
      episode_number: 2,
      episode_name: "=HYPERLINK(\"bad\")",
      tmdb_episode_id: 99,
      air_date: "2024-05-01",
      runtime_minutes: 45,
      watched_at: "2026-09-22 18:30:00",
    }]);

    assert.equal(headers["Content-Type"], "text/csv; charset=utf-8");
    assert.equal(headers["Content-Disposition"], 'attachment; filename="alice_lumina_watch_history.csv"');
    assert.equal(headers["Cache-Control"], "no-store");
    assert.match(body, /^\uFEFF"username","series_name"/);
    assert.match(body, /"A, ""Series"""/);
    assert.match(body, /"'=HYPERLINK\(""bad""\)"/);
    assert.match(body, /"2026-09-22 18:30:00"/);
  } finally {
    pool.query = originalQuery;
  }
});

test("exports a header-only CSV when the user has no watched episodes", async () => {
  const originalQuery = pool.query;
  try {
    const { body } = await requestExport([{ username: "alice", watch_id: null }]);
    assert.equal(body.split("\r\n").length, 2);
    assert.match(body, /^\uFEFF"username","series_name"/);
  } finally {
    pool.query = originalQuery;
  }
});
