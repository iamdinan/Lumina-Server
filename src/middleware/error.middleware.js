function errorHandler(err, req, res, next) {
  console.error(err);

  // Known, deliberate errors (thrown via AppError)
  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Postgres-specific errors, handled generically here so controllers don't need to
  if (err.code === "23505") {
    return res.status(409).json({ error: "Username is taken" });
  }
  if (err.code === "23503") {
    return res.status(404).json({ error: "Related resource not found" });
  }

  // Fallback — anything unexpected
  res.status(500).json({ error: "Something went wrong" });
}

module.exports = errorHandler;
