const express = require("express");
const router = express.Router();
const {
    childLogin,
    getChildTasks,
    getChildNotifications
} = require("../Controllers/childController");
const { authenticateChildToken } = require("../Middlewares/auth");

// Delegate routing to the contr
router.post("/auth/login", childLogin);
router.get("/get_all_tasks",authenticateChildToken,getChildTasks);
router.get("/get_notification", authenticateChildToken,getChildNotifications);
// router.use("/", childController.router);

module.exports = router;
  