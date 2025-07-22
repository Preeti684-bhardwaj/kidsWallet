const express = require("express");
const router = express.Router();
const {
    childLogin,
    getChildTasks,
    getChildNotifications
} = require("../Controllers/childController");
const { authenticateChildToken,authenticateToken } = require("../Middlewares/auth");
const childAnalyticsController = require("../Controllers/childAnalyticsController");

const bind = (controller, method) => controller[method].bind(controller);

// Delegate routing to the contr
router.post("/auth/login", childLogin);
router.get("/get_all_tasks",authenticateChildToken,getChildTasks);
router.get("/get_notification", authenticateChildToken,getChildNotifications);
// Get comprehensive child analytics
router.get('/analytic/:childId', authenticateToken, bind(childAnalyticsController, 'getChildAnalytics'));

// Get child streak information
router.get('/analytic/:childId/streak', authenticateToken, bind(childAnalyticsController,'getChildStreak'));

// Get children comparison for parents
router.get('/parent/:parentId/children-comparison', authenticateToken, bind(childAnalyticsController,'getChildrenComparison'));

// router.use("/", childController.router);

module.exports = router;
  