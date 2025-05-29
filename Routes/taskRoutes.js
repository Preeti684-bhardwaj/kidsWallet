const express = require('express');
const router = express.Router();
const {
  createTaskTemplate,
    createTask,
    getTaskAnalytics,
    listTasks,
    getAllTaskTemplate,
    updateTaskStatus,
    updateTaskReward,
    deleteTask,
} = require('../Controllers/taskController');
const {
    authenticateUnifiedToken,
    authenticateToken,
  } = require("../Middlewares/auth");


// // Delegate routing to the controller
router.post("/create_task_template", authenticateToken, createTaskTemplate);
router.get("/get_all_task_template",authenticateToken,getAllTaskTemplate);
router.post("/create", authenticateToken, createTask);
router.put("/status/:taskId",authenticateUnifiedToken,updateTaskStatus);
router.put("/update/:taskId", authenticateToken, updateTaskReward);
router.delete("/delete/:taskId", authenticateToken, deleteTask);
// router.get("/analytics", authenticateToken, getTaskAnalytics);
router.get("/list", authenticateUnifiedToken, listTasks);
// // router.use('/', taskController.router);

module.exports = router;