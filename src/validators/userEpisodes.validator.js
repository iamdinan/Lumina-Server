const { param, query } = require("express-validator");

const episodeIdParam = [
  param("episodeId").isInt().withMessage("must be an integer"),
];

const activityYearValidator = [
  query("year").optional().isInt({ min: 1, max: 9999 }).withMessage("must be a valid year"),
];

module.exports = { episodeIdParam, activityYearValidator };
