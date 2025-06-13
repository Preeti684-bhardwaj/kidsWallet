const bcrypt = require("bcrypt");
const models = require("../Modals/index");
const { generateToken } = require("../Utils/parentHelper");
const ErrorHandler = require("../Utils/errorHandle");
const asyncHandler = require("../Utils/asyncHandler");

  // --------child login----------------------------------------
 const childLogin = asyncHandler(async (req, res, next) => {
    try {
      let { username, password } = req.body;
      // Validate required fields
      if (!username || username.trim() === "") {
        return next(new ErrorHandler("Username is required", 400));
      }
      username = username.trim();
      // Find child by username
      const child = await models.Child.findOne({
        where: { username },
        include: [
          {
            model: models.Parent,
            as: "parent",
            attributes: ["id", "name", "email"],
          },
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
          type: "child",
          id: child.id,
          name: child.name,
          username: child.username,
        };

        // Generate token
        const token = generateToken(obj);

        return res.status(200).json({
          success: true,
          message: "Login successful",
          token,
          data: {
            id: child.id,
            name: child.name,
            age: child.age,
            coinBalance: child.coinBalance,
            deviceSharingMode: child.deviceSharingMode,
          },
        });
      }

      // For non-device sharing mode, password is required
      if (!password || password.trim() === "") {
        return next(new ErrorHandler("Password is required", 400));
      }

      // Check if child has a password set
      if (!child.password) {
        return next(
          new ErrorHandler(
            "Child account is not properly configured. Please contact your parent.",
            400
          )
        );
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, child.password);
      if (!isPasswordValid) {
        return next(new ErrorHandler("Invalid username or password", 401));
      }
      let obj = {
        type: "child",
        id: child.id,
        name: child.name,
        username: child.username,
      };

      // Generate token
      const token = generateToken(obj);

      return res.status(200).json({
        success: true,
        message: "Login successful",
        token,
        data: {
          id: child.id,
          name: child.name,
          age: child.age,
          coinBalance: child.coinBalance,
          deviceSharingMode: child.deviceSharingMode,
        },
      });
    } catch (error) {
      console.error("Error during child login:", error);
      return next(new ErrorHandler(error.message || "Login failed", 500));
    }
  });

  // --------get child tasks----------------------------------------
 const getChildTasks = asyncHandler(async (req, res, next) => {
    try {
      console.log("Fetching tasks for child:", req.child.id);
      const childId = req.child.id;
      const { status } = req.query;
  
      // Build query based on childId and optional status filter
      const query = { childId };
      if (status) {
        query.status = status.split(',').filter(s => ['assigned', 'completed', 'approved', 'rejected'].includes(s));
      }
  
      // Get tasks with associated TaskTemplate data
      const tasks = await models.Task.findAll({
        where: query,
        include: [
          {
            model: models.TaskTemplate,
            attributes: ['title', 'description', 'image'],
            required: true // Ensure tasks without a template are excluded
          }
        ],
        order: [
          ["dueDate", "ASC"],
          ["createdAt", "DESC"]
        ],
        attributes: [
          'id',
          'coinReward',
          'difficultyLevel',
          'status',
          'dueDate',
          'dueTime',
          'duration',
          'isRecurring',
          'recurringFrequency',
          'completedAt'
        ]
      });
  
      // Check if tasks exist
      if (!tasks || tasks.length === 0) {
        return next(new ErrorHandler("No tasks found for this child", 404));
      }
  
      // Format tasks to combine Task and TaskTemplate data
      const formattedTasks = tasks.map(task => ({
        id: task.id,
        title: task.TaskTemplate?.title,
        description: task.TaskTemplate?.description,
        image: task.TaskTemplate?.image,
        coinReward: task.coinReward,
        difficultyLevel: task.difficultyLevel,
        status: task.status,
        dueDate: task.dueDate,
        dueTime: task.dueTime,
        duration: task.duration,
        isRecurring: task.isRecurring,
        recurringFrequency: task.recurringFrequency,
        completedAt: task.completedAt
      }));
  
      return res.status(200).json({
        success: true,
        message: "Tasks retrieved successfully",
        data: formattedTasks
      });
    } catch (error) {
      console.error("Error fetching tasks:", error);
      return next(
        new ErrorHandler(error.message || "Failed to fetch tasks", 500)
      );
    }
  });

  // --------get child notifications----------------------------------------
  const getChildNotifications = asyncHandler(async (req, res, next) => {
    try {
      const childId = req.child.id;

      // Fetch notifications for the child
      const notifications = await models.Notification.findAll({
        where: { recipientId: childId ,isRead: false},
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

      return res.status(200).json({ success: true, data: notifications });
    } catch (error) {
      console.error("Error fetching notifications:", error);
      return next(
        new ErrorHandler(error.message || "Failed to fetch notifications", 500)
      );
    }
  });

module.exports ={
  childLogin,
  getChildTasks,
  getChildNotifications
};
