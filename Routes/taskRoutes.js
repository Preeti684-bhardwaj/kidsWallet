const express = require('express');
const router = express.Router();
const {
    createTask,
    getTaskAnalytics,
    listTasks,
    getAllTaskTemplate,
    updateTaskStatus,
    updateTask,
    deleteTask,
} = require('../Controllers/taskController');
const {
    authenticateUnifiedToken,
    authenticateToken,
  } = require("../Middlewares/auth");


// Delegate routing to the controller
router.post("/create", authenticateToken, createTask);
router.get("/get_all_task_template",authenticateToken,getAllTaskTemplate);
router.put("/status/:taskId",authenticateUnifiedToken,updateTaskStatus);
router.put("/update/:taskId", authenticateToken, updateTask);
router.delete("/delete/:taskId", authenticateToken, deleteTask);
router.get("/analytics", authenticateToken, getTaskAnalytics);
router.get("/list", authenticateUnifiedToken, listTasks);
// router.use('/', taskController.router);

module.exports = router;