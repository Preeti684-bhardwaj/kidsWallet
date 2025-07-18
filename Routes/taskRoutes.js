const express = require('express');
const router = express.Router();
const {
  createTaskTemplate,
    createTask,
    getTasksByTemplateId,
    listTasks,
    getAllTaskTemplate,
    updateTaskStatus,
    updateTaskTemplateAndTasks,
    getTaskTemplateWithRecurringDates,
    getTaskTemplateAnalytics,
    // updateTaskReward,
    deleteTasksByTemplate,
    deleteTask,
} = require('../Controllers/taskController');
const {
    authenticateUnifiedToken,
    authenticateToken,
  } = require("../Middlewares/auth");
const upload = require("../Middlewares/multer");


// // Delegate routing to the controller
router.post("/create_task_template", authenticateToken, upload.single('image'), createTaskTemplate);
router.get("/get_all_task_template",authenticateToken,getAllTaskTemplate);
router.get("/by-template/:taskTemplateId", authenticateUnifiedToken, getTasksByTemplateId);
router.get("/get_detail/:childId/template/:taskTemplateId",authenticateToken,getTaskTemplateWithRecurringDates);
router.post("/create", authenticateToken, createTask);
router.put("/status/:taskId",authenticateUnifiedToken,updateTaskStatus);
router.put(
  "/update_template/:taskTemplateId", 
  authenticateToken, 
  upload.single('image'), 
  updateTaskTemplateAndTasks
);

// router.put("/update/:taskId", authenticateToken, updateTaskReward);
router.delete("/delete/:taskId", authenticateToken, deleteTask);
router.delete("/child/:childId/template/:templateId", authenticateToken, deleteTasksByTemplate);
// router.get("/analytics", authenticateToken, getTaskAnalytics);
router.get("/list", authenticateUnifiedToken, listTasks);
router.get("/task-template/:taskTemplateId/analytics", authenticateToken , getTaskTemplateAnalytics);
// // router.use('/', taskControltaskController.router);

module.exports = router;