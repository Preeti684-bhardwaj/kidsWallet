const bcrypt = require("bcrypt");
const BaseController = require("./index");
const models = require("../Modals/index");
const db = require("../Configs/db/DbConfig");
const sequelize = db.sequelize;
const { generateToken, generateOTP } = require("../Utils/parentHelper");
const {
  isValidEmail,
  isValidPassword,
  isValidLength,
} = require("../Validators/parentValidation");
// const sendEmail = require("../Utils/sendEmail");
const ErrorHandler = require("../Utils/errorHandle");
const asyncHandler = require("../Utils/asyncHandler");
const { authenticateChildToken } = require("../Middlewares/auth");
// const {
//   KALEYRA_BASE_URL,
//   KALEYRA_API_KEY,
//   KALEYRA_FLOW_ID,
//   KALEYRA_PHONE_FLOW_ID,
// } = process.env;

// // Kaleyra API configuration
// const KALEYRA_CONFIG = {
//   baseURL: KALEYRA_BASE_URL,
//   apiKey: KALEYRA_API_KEY,
//   flowId: KALEYRA_FLOW_ID,
//   phoneFlowId: KALEYRA_PHONE_FLOW_ID,
// };
// const QR_EXPIRY_TIME = 5 * 60 * 1000;

class ChildController extends BaseController {
  constructor() {
    // Pass the User model to the parent BaseController
    super(models.Child);

    // Add custom routes in addition to base routes
    this.router.post("/auth/login", this.childLogin.bind(this));
    this.router.get(
      "/get_all_tasks",
      authenticateChildToken,
      this.getChildTasks.bind(this)
    );
    this.router.put(
      "/complete_task/:taskId",
      authenticateChildToken,
      this.markTaskComplete.bind(this)
    );
    this.router.get(
      "/get_notification",
      authenticateChildToken,
      this.getChildNotifications.bind(this)
    );
  }

  // Override BaseController's listArgVerify to add user-specific query logic
  listArgVerify(req, res, queryOptions) {
    // Remove sensitive fields from the response
    if (queryOptions.attributes) {
      queryOptions.attributes = queryOptions.attributes.filter(
        (attr) => !["password"].includes(attr)
      );
    }
  }

  // Override BaseController's afterCreate for post-creation actions
  async afterCreate(req, res, newObject, transaction) {
    // Remove password from response
    if (newObject.dataValues) {
      delete newObject.dataValues.password;
      //   delete newObject.dataValues.otp;
      //   delete newObject.dataValues.otpExpiry;
    }
  }

  childLogin = asyncHandler(async (req, res, next) => {
    try {
      const { username, password } = req.body;

      // Find child by username
      const child = await models.Child.findOne({
        where: { username },
        include: [
          { model: models.Parent, as:'parent',attributes: ["id", "name", "email"] },
        ],
      });

      if (!child) {
        return next(new ErrorHandler("Invalid username or password", 401));
      }

      // If device sharing mode is enabled, password may be null
      if (child.deviceSharingMode) {
        // Special handling for device sharing mode - simplified login
        // In a real app, you might want additional verification
        let obj = {
          id: child.id,
          name: child.name,
          username: child.username,
        };

        // Generate token
        const token = generateToken(obj);

        return res.status(200).json({
          message: "Login successful",
          token,
          data: {
            id: child.id,
            name: child.name,
            age: child.age,
            coinBalance: child.coinBalance,
          },
        });
      }

      // Verify password for non-device sharing mode
      if (
        !child.password ||
        !(await bcrypt.compare(password, child.password))
      ) {
        return next(new ErrorHandler("Invalid username or password", 401));
      }

      let obj = {
        id: child.id,
        name: child.name,
        username: child.username,
      };

      // Generate token
      const token = generateToken(obj);

      return res.status(200).json({
        message: "Login successful",
        token,
        data: {
          id: child.id,
          name: child.name,
          age: child.age,
          coinBalance: child.coinBalance,
        },
      });
    } catch (error) {
      console.error("Error during child login:", error);
      return next(new ErrorHandler(error.message || "Login failed", 500));
    }
  });

  getChildTasks = asyncHandler(async (req, res, next) => {
    try {
      console.log("Fetching tasks for child:", req.child.id);
      const childId = req.child.id;
      const { status } = req.query;

      // Build query based on status filter
      const query = { childId };
      if (status) {
        query.status = status;
      }

      // Get tasks
      const tasks = await models.Task.findAll({
        where: query,
        order: [
          ["dueDate", "ASC"],
          ["createdAt", "DESC"],
        ],
      });

      // Check if tasks exist
      if (!tasks || tasks.length === 0) {
        return next(new ErrorHandler("No tasks found for this child", 404));
      }
      return res.status(200).json({ status: true, data: tasks });
    } catch (error) {
      console.error("Error fetching tasks:", error);
      return next(
        new ErrorHandler(error.message || "Failed to fetch tasks", 500)
      );
    }
  });

  markTaskComplete = asyncHandler(async (req, res, next) => {
    try {
      const childId = req.child.id;
      const { taskId } = req.params;

      // Find task
      const task = await models.Task.findOne({
        where: { id: taskId, childId },
      });
      if (!task) {
        return next(
          new ErrorHandler("Task not found or not assigned to this child", 404)
        );
      }

      // Check if task is already completed
      if (task.status !== "assigned") {
        return next(
          new ErrorHandler(`Task is already marked as ${task.status}`, 400)
        );
      }

      // Update task status
      await task.update({
        status: "completed",
        completedAt: new Date(),
      });

      // Create notification for parent
      await models.Notification.create({
        type: "task_completion",
        message: `Task '${task.title}' marked as completed by ${childId} and waiting for approval`,
        recipientType: "parent",
        recipientId: task.parentId,
        relatedItemType: "task",
        relatedItemId: task.id,
      });

      return res.status(200).json({
        status: true,
        message: "Task marked as completed",
        data: task,
      });
    } catch (error) {
      console.error("Error marking task as complete:", error);
      return next(
        new ErrorHandler(error.message || "Failed to update task", 500)
      );
    }
  });

  getChildNotifications = asyncHandler(async (req, res, next) => {
    try {
      const childId = req.child.id;

      // Fetch notifications for the child
      const notifications = await models.Notification.findAll({
        where: { recipientId: childId },
        order: [["createdAt", "DESC"]],
      });

      // Check if notifications exist
      if (!notifications || notifications.length === 0) {
        return next(
          new ErrorHandler("No notifications found for this child", 404)
        );
      }
      // Update the isRead status to true for all fetched notifications
      await models.Notification.update(
        { isRead: true },
        { where: { recipientId: childId } }
      );

      return res.status(200).json({ status: true, data: notifications });
    } catch (error) {
      console.error("Error fetching notifications:", error);
      return next(
        new ErrorHandler(error.message || "Failed to fetch notifications", 500)
      );
    }
  });
}

module.exports = new ChildController();
