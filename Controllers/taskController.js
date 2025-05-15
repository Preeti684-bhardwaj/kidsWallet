const BaseController = require("./index");
const models = require("../Modals/index");
const db = require("../Configs/db/DbConfig");
const sequelize = db.sequelize;
const ErrorHandler = require("../Utils/errorHandle");
const asyncHandler = require("../Utils/asyncHandler");
const { authenticateUnifiedToken, authenticateToken } = require("../Middlewares/auth");
const {calculateNextDueDate} = require("../Utils/parentHelper");

class taskController extends BaseController {
  constructor() {
    // Pass the Task model to the parent BaseController
    super(models.Task);

    // Add custom routes
    this.router.post(
      "/create",
      authenticateToken,
      this.createTask.bind(this)
    );
    this.router.put(
      "/status/:taskId",
      authenticateUnifiedToken,
      this.updateTaskStatus.bind(this)
    );
  }

  // Override BaseController's listArgVerify to add filtering logic
  listArgVerify(req, res, queryOptions) {
    // Add filtering for specific task statuses if needed
    if (!queryOptions.where) queryOptions.where = {};
    // Add any default filtering logic here
  }

  // Override BaseController's afterCreate for post-creation actions
  async afterCreate(req, res, newObject, transaction) {
    // Custom logic after task creation if needed
  }

  // --------create task--------------------------------------------------
  createTask = asyncHandler(async (req, res, next) => {
    try {
      const parentId = req.parent.id;
      const {
        title,
        description,
        coinReward,
        difficultyLevel,
        childId,
        dueDate, // Format: YYYY-MM-DD
        dueTime, // Format: HH:MM
        duration,
        isRecurring,
        recurringFrequency
      } = req.body;
  
      // Verify parent exists
      const parent = await models.Parent.findByPk(parentId);
      if (!parent) {
        return next(new ErrorHandler("Parent not found", 404));
      }
  
      // Verify child belongs to parent
      const child = await models.Child.findOne({
        where: { id: childId, parentId },
      });
      if (!child) {
        return next(
          new ErrorHandler("Child not found or not associated with this parent", 404)
        );
      }
  
      // Validate title
      const trimmedTitle = title?.trim();
      if (
        !trimmedTitle ||
        /^\d+$/.test(trimmedTitle) || // numeric-only
        /^[^a-zA-Z0-9]+$/.test(trimmedTitle) // special characters only
      ) {
        return next(
          new ErrorHandler(
            "Invalid title. Must contain letters and not be empty, numeric-only, or special characters only.",
            400
          )
        );
      }
  
      // Validate coinReward
      if (typeof coinReward !== "number" || coinReward <= 0) {
        return next(
          new ErrorHandler("Coin reward must be a positive number.", 400)
        );
      }
  
      // Validate dueDate and dueTime
      let taskDueDateTime = null;
      if (dueDate) {
        // Validate dueDate format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
          return next(new ErrorHandler("Invalid dueDate format. Expected YYYY-MM-DD.", 400));
        }
  
        // Validate dueTime format (HH:MM) if provided
        if (dueTime && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(dueTime)) {
          return next(new ErrorHandler("Invalid dueTime format. Expected HH:MM (24-hour).", 400));
        }
  
        // Construct taskDueDateTime in IST
        taskDueDateTime = new Date(`${dueDate}T${dueTime || "00:00"}:00+05:30`); // Explicitly set to IST
        if (isNaN(taskDueDateTime.getTime())) {
          return next(new ErrorHandler("Invalid due date or time format.", 400));
        }
  
        // Adjust current time to IST for comparison
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
        const nowIST = new Date(now.getTime() + istOffset);
  
        // For non-recurring tasks, due date/time must not be in the past
        if (!isRecurring && taskDueDateTime < nowIST) {
          return next(new ErrorHandler("Due date and time cannot be in the past for non-recurring tasks.", 400));
        }
  
        // For recurring tasks, allow past due dates (scheduler will handle missed recurrences)
        // But ensure the date is valid and not malformed
      } else if (!isRecurring) {
        // For non-recurring tasks, dueDate is required
        return next(new ErrorHandler("dueDate is required for non-recurring tasks.", 400));
      }
  
       // Validate duration
    if (duration !== undefined) {
      // Parse duration as a number if it's a string
      const parsedDuration = typeof duration === "string" ? parseInt(duration, 10) : duration;

      // Check if parsedDuration is a valid number
      if (isNaN(parsedDuration) || typeof parsedDuration !== "number") {
        return next(new ErrorHandler("Duration must be a number.", 400));
      }

      // Check if duration is positive
      if (parsedDuration <= 0) {
        return next(new ErrorHandler("Duration must be a positive number in minutes.", 400));
      }

      // Check if duration is one of the allowed values
      const allowedDurations = [5, 15, 30, 60, 120];
      if (!allowedDurations.includes(parsedDuration)) {
        return next(
          new ErrorHandler(`Duration must be one of the following values: ${allowedDurations.join(", ")}.`, 400)
        );
      }
    }
  
      // Validate recurrence
      const allowedFrequencies = ['once', 'daily', 'weekly', 'monthly'];
      if (isRecurring && (!recurringFrequency || !allowedFrequencies.includes(recurringFrequency))) {
        return next(new ErrorHandler("Invalid recurrence frequency. Allowed: once, daily, weekly, monthly.", 400));
      }
  
      // Prevent duplicate task for same child, title, and dueDateTime (if dueDate is provided)
      if (taskDueDateTime) {
        const existingTask = await models.Task.findOne({
          where: {
            childId,
            title: trimmedTitle,
            dueDate: taskDueDateTime,
          },
        });
        if (existingTask) {
          return next(new ErrorHandler("Duplicate task for same child and time already exists.", 400));
        }
      }
  
      // Create the initial task
      const newTask = await models.Task.create({
        title: trimmedTitle,
        description,
        coinReward,
        difficultyLevel,
        childId,
        parentId,
        dueDate: taskDueDateTime || null,
        dueTime: dueTime || "00:00", // Default to "00:00" if not provided
        duration: duration || null,
        isRecurring: isRecurring || false,
        recurringFrequency: isRecurring ? recurringFrequency : 'once',
        parentTaskId: null, // This is the original task
      });
  
      // Create notification for child
      await models.Notification.create({
        type: "task_reminder",
        message: `New task assigned: ${trimmedTitle}`,
        recipientType: "child",
        recipientId: childId,
        relatedItemType: "task",
        relatedItemId: newTask.id,
      });
  
      return res.status(201).json({
        message: "Task created successfully",
        data: newTask,
      });
    } catch (error) {
      console.error("Error creating task:", error);
      return res.status(500).json({ message: "Failed to create task", error: error.message });
    }
  });

  // ------------unified task status update---------------------------------
  updateTaskStatus = asyncHandler(async (req, res, next) => {
    try {
      const { taskId } = req.params;
      const { status, reason } = req.body; // status can be 'completed', 'approved', 'rejected'
      
      // Validate status values
      const allowedStatuses = ['completed', 'approved', 'rejected'];
      if (!status || !allowedStatuses.includes(status)) {
        return next(
          new ErrorHandler("Invalid status. Allowed values: completed, approved, rejected", 400)
        );
      }

      // Determine user type from decoded token
      const userType = req.user?.obj?.type || req.child?.obj?.type || req.parent?.obj?.type;
      const userId = req.user?.obj?.id || req.child?.obj?.id || req.parent?.obj?.id;
      
      if (!userType || !userId) {
        return next(new ErrorHandler("Invalid authentication token", 401));
      }

      // Find task with appropriate conditions based on user type
      let taskQuery = { where: { id: taskId } };
      
      if (userType === 'child') {
        taskQuery.where.childId = userId;
      } else if (userType === 'parent') {
        taskQuery.where.parentId = userId;
      } else {
        return next(new ErrorHandler("Invalid user type", 403));
      }

      // Find task with child details for coin operations
      const task = await models.Task.findOne({
        ...taskQuery,
        include: [{ model: models.Child, attributes: ["id", "name", "coinBalance"] }],
      });

      if (!task) {
        return next(
          new ErrorHandler("Task not found or not accessible", 404)
        );
      }

      // Status-specific validations and logic
      if (status === 'completed') {
        // Child marking task as complete
        if (userType !== 'child') {
          return next(new ErrorHandler("Only children can mark tasks as completed", 403));
        }
        
        if (task.status !== "assigned") {
          return next(new ErrorHandler(`Task is already marked as ${task.status}`, 400));
        }

        // Update task status
        await task.update({
          status: "completed",
          completedAt: new Date(),
        });

        // Create notification for parent
        await models.Notification.create({
          type: "task_completion",
          message: `Task '${task.title}' marked as completed by ${task.Child.name} and waiting for approval`,
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

      } else if (status === 'approved') {
        // Parent approving task
        if (userType !== 'parent') {
          return next(new ErrorHandler("Only parents can approve tasks", 403));
        }
        
        if (task.status !== "completed") {
          return next(new ErrorHandler("Task must be in completed state to approve", 400));
        }

        // Start transaction
        const t = await sequelize.transaction();

        try {
          // Update task status
          await task.update({ status: "approved" }, { transaction: t });

          const child = task.Child;

          // Award coins
          await child.update(
            {
              coinBalance: child.coinBalance + task.coinReward,
            },
            { transaction: t }
          );

          // Record transaction
          await models.Transaction.create(
            {
              amount: task.coinReward,
              type: "task_reward",
              description: `Reward for completing task: ${task.title}`,
              childId: child.id,
              taskId: task.id,
            },
            { transaction: t }
          );

          // Update streak
          const streak = await models.Streak.findOne({
            where: { childId: child.id },
          });
          if (streak) {
            const lastDate = streak.lastCompletedDate
              ? new Date(streak.lastCompletedDate)
              : null;
            const today = new Date();

            // Check if it's consecutive
            if (
              !lastDate ||
              today.getDate() - lastDate.getDate() === 1 ||
              (today.getDate() === 1 &&
                lastDate.getDate() ===
                  new Date(
                    lastDate.getFullYear(),
                    lastDate.getMonth() + 1,
                    0
                  ).getDate())
            ) {
              await streak.update(
                {
                  currentStreak: streak.currentStreak + 1,
                  lastCompletedDate: today,
                },
                { transaction: t }
              );

              // Check for 7-day streak bonus
              if (streak.currentStreak % 7 === 0) {
                const bonusAmount = 50;
                await child.update(
                  {
                    coinBalance: child.coinBalance + bonusAmount,
                  },
                  { transaction: t }
                );

                await models.Transaction.create(
                  {
                    amount: bonusAmount,
                    type: "streak_bonus",
                    description: `Bonus for ${streak.currentStreak}-day streak`,
                    childId: child.id,
                  },
                  { transaction: t }
                );

                await models.Notification.create(
                  {
                    type: "achievement",
                    message: `Congratulations! You've maintained a ${streak.currentStreak}-day streak!`,
                    recipientType: "child",
                    recipientId: child.id,
                    relatedItemType: "achievement",
                    relatedItemId: null,
                  },
                  { transaction: t }
                );
              }
            } else {
              // Reset streak
              await streak.update(
                {
                  currentStreak: 1,
                  lastCompletedDate: today,
                },
                { transaction: t }
              );
            }
          }

          // Handle recurring tasks
          if (task.isRecurring) {
            const nextDueDate = calculateNextDueDate(
              task.dueDate || new Date(),
              task.recurringFrequency
            );
            await models.Task.create(
              {
                title: task.title,
                description: task.description,
                coinReward: task.coinReward,
                difficultyLevel: task.difficultyLevel,
                childId: task.childId,
                parentId: task.parentId,
                dueDate: nextDueDate,
                isRecurring: true,
                recurringFrequency: task.recurringFrequency,
              },
              { transaction: t }
            );
          }

          // Notify child
          await models.Notification.create(
            {
              type: "task_approval",
              message: `Your task '${task.title}' was approved! You earned ${task.coinReward} Super Coins.`,
              recipientType: "child",
              recipientId: child.id,
              relatedItemType: "task",
              relatedItemId: task.id,
            },
            { transaction: t }
          );

          await t.commit();

          return res.status(200).json({
            message: "Task approved and coins awarded",
            data: {
              task,
              coinsAwarded: task.coinReward,
              newBalance: child.coinBalance + task.coinReward,
            },
          });
        } catch (error) {
          await t.rollback();
          throw error;
        }

      } else if (status === 'rejected') {
        // Parent rejecting task
        if (userType !== 'parent') {
          return next(new ErrorHandler("Only parents can reject tasks", 403));
        }
        
        if (task.status !== "completed") {
          return next(new ErrorHandler("Task must be in completed state to reject", 400));
        }

        // Update task status
        await task.update({ status: "rejected" });

        // Notify child
        await models.Notification.create({
          type: "task_approval",
          message: `Your task '${task.title}' was not approved. ${
            reason ? "Reason: " + reason : ""
          }`,
          recipientType: "child",
          recipientId: task.childId,
          relatedItemType: "task",
          relatedItemId: task.id,
        });

        return res.status(200).json({
          message: "Task rejected",
          data: task,
        });
      }

    } catch (error) {
      console.error("Error updating task status:", error);
      return next(
        new ErrorHandler(error.message || "Failed to update task status", 500)
      );
    }
  });
}
module.exports = new taskController();