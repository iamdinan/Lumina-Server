const express = require("express");
const router = express.Router();
const usersController = require("../controllers/users.controller");
const validate = require("../middleware/validate.middleware");
const {
  registerValidator,
  loginValidator,
} = require("../validators/users.validator");
const { authLimiter } = require("../middleware/rateLimit.middleware");
const { requireAuth } = require("../middleware/auth.middleware");
const userEpisodesController = require("../controllers/userEpisodes.controller");
const { updateProfileValidator } = require("../validators/users.validator");
const { activityYearValidator } = require("../validators/userEpisodes.validator");
const { exportWatchHistory } = require("../controllers/watchHistory.controller");

router.post(
  "/register",
  authLimiter,
  registerValidator,
  validate,
  usersController.register,
);
router.post(
  "/login",
  authLimiter,
  loginValidator,
  validate,
  usersController.login,
);
router.get("/me", requireAuth, usersController.getMe);
router.patch(
  "/me",
  requireAuth,
  updateProfileValidator,
  validate,
  usersController.updateProfile,
);
router.get("/me/stats", requireAuth, userEpisodesController.getWatchStats);
router.get(
  "/me/activity",
  requireAuth,
  activityYearValidator,
  validate,
  userEpisodesController.getWatchActivity,
);
router.get("/me/watch-history/export", requireAuth, exportWatchHistory);

module.exports = router;
