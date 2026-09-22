const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/db");
const { getWatchActivity } = require("../src/controllers/userEpisodes.controller");

function requestActivity(year, days) {
  pool.query = async (sql) =>
    sql.startsWith("SELECT TO_CHAR(CURRENT_DATE")
      ? { rows: [{ today: "2028-01-01" }] }
      : { rows: days };

  return new Promise((resolve, reject) => {
    getWatchActivity(
      { query: year ? { year } : {}, user: { userId: 1 } },
      { json: resolve },
      reject,
    );
  });
}

test("activity keeps the streak across years and filters the selected year", async () => {
  const originalQuery = pool.query;
  try {
    const days = [
      { date: "2028-01-01", count: 1 },
      { date: "2027-12-31", count: 2 },
      { date: "2026-06-01", count: 3 },
    ];
    const result = await requestActivity("2027", days);

    assert.equal(result.today, "2028-01-01");
    assert.equal(result.year, 2027);
    assert.deepEqual(result.available_years, [2028, 2027, 2026]);
    assert.equal(result.current_streak, 2);
    assert.deepEqual(result.days, [days[1]]);
  } finally {
    pool.query = originalQuery;
  }
});

test("empty activity defaults to the current year", async () => {
  const originalQuery = pool.query;
  try {
    const result = await requestActivity(null, []);

    assert.equal(result.year, 2028);
    assert.deepEqual(result.available_years, [2028]);
    assert.equal(result.current_streak, 0);
    assert.deepEqual(result.days, []);
  } finally {
    pool.query = originalQuery;
  }
});
