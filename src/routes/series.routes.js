const express = require("express");
const router = express.Router();
const seriesController = require("../controllers/series.controller");
const validate = require("../middleware/validate.middleware");
const {
  searchValidator,
  tmdbIdParam,
} = require("../validators/series.validator");

router.get("/search", searchValidator, validate, seriesController.search);
router.post(
  "/:tmdbId/import",
  tmdbIdParam,
  validate,
  seriesController.importSeries,
);
router.get("/popular", seriesController.getPopular);
router.get("/top-rated", seriesController.getTopRated);
router.get("/airing-today", seriesController.getAiringToday);
router.get("/on-the-air", seriesController.getOnTheAir);

module.exports = router;
