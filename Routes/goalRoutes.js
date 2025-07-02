const express = require('express');
const router = express.Router();
const {
  createGoal,getAllGoals,getGoalById,updateGoal,deleteGoal,getGoalAnalytics
} = require('../Controllers/goalController');
const {
    authenticateUnifiedToken,
    authenticateToken,
  } = require("../Middlewares/auth");
const upload = require("../Middlewares/multer");


// // Delegate routing to the controller
router.post("/create_goal", authenticateToken, upload.single('image'), createGoal);
router.get("/list_goal",authenticateUnifiedToken,getAllGoals);
router.get("/get_goal/:goalId", authenticateUnifiedToken, getGoalById);
// router.put("/status/:goalId",authenticateUnifiedToken,updateGoal);
router.put("/update_goal/:goalId", authenticateUnifiedToken,upload.single('image'), updateGoal);
router.delete("/delete_goal/:goalId", authenticateToken, deleteGoal);
router.get("/analytics", authenticateUnifiedToken, getGoalAnalytics);
// router.delete("/child/:childId/template/:templateId", authenticateToken, deleteTasksByTemplate);
// router.get("/analytics", authenticateToken, getTaskAnalytics);
// router.get("/list", authenticateUnifiedToken, listTasks);
// // router.use('/', taskController.router);

module.exports = router;