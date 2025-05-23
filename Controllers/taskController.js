const models = require("../Modals/index");
const db = require("../Configs/db/DbConfig");
const sequelize = db.sequelize;
const ErrorHandler = require("../Utils/errorHandle");
const asyncHandler = require("../Utils/asyncHandler");
const { calculateNextDueDate } = require("../Utils/parentHelper");

  // --------create task--------------------------------------------------
  const createTask = asyncHandler(async (req, res, next) => {
    try {
      const parentId = req.parent.id;
      const {
        title,
        description,
        image, // Optional image field added
        coinReward,
        difficultyLevel,
        childId,
        dueDate, // Format: YYYY-MM-DD
        dueTime, // Format: HH:MM
        duration,
        isRecurring,
        recurringFrequency,
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
          new ErrorHandler(
            "Child not found or not associated with this parent",
            404
          )
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
          return next(
            new ErrorHandler(
              "Invalid dueDate format. Expected YYYY-MM-DD.",
              400
            )
          );
        }

        // Validate dueTime format (HH:MM) if provided
        if (dueTime && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(dueTime)) {
          return next(
            new ErrorHandler(
              "Invalid dueTime format. Expected HH:MM (24-hour).",
              400
            )
          );
        }

        // Construct taskDueDateTime in IST
        taskDueDateTime = new Date(`${dueDate}T${dueTime || "00:00"}:00+05:30`); // Explicitly set to IST
        if (isNaN(taskDueDateTime.getTime())) {
          return next(
            new ErrorHandler("Invalid due date or time format.", 400)
          );
        }

        // Adjust current time to IST for comparison
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
        const nowIST = new Date(now.getTime() + istOffset);

        // For non-recurring tasks, due date/time must not be in the past
        if (!isRecurring && taskDueDateTime < nowIST) {
          return next(
            new ErrorHandler(
              "Due date and time cannot be in the past for non-recurring tasks.",
              400
            )
          );
        }

        // For recurring tasks, allow past due dates (scheduler will handle missed recurrences)
        // But ensure the date is valid and not malformed
      } else if (!isRecurring) {
        // For non-recurring tasks, dueDate is required
        return next(
          new ErrorHandler("dueDate is required for non-recurring tasks.", 400)
        );
      }

      // Validate duration
      if (duration !== undefined) {
        // Parse duration as a number if it's a string
        const parsedDuration =
          typeof duration === "string" ? parseInt(duration, 10) : duration;

        // Check if parsedDuration is a valid number
        if (isNaN(parsedDuration) || typeof parsedDuration !== "number") {
          return next(new ErrorHandler("Duration must be a number.", 400));
        }

        // Check if duration is positive
        if (parsedDuration <= 0) {
          return next(
            new ErrorHandler(
              "Duration must be a positive number in minutes.",
              400
            )
          );
        }

        // Check if duration is one of the allowed values
        const allowedDurations = [5, 15, 30, 60, 120];
        if (!allowedDurations.includes(parsedDuration)) {
          return next(
            new ErrorHandler(
              `Duration must be one of the following values: ${allowedDurations.join(
                ", "
              )}.`,
              400
            )
          );
        }
      }

      // Validate recurrence
      const allowedFrequencies = ["once", "daily", "weekly", "monthly"];
      if (
        isRecurring &&
        (!recurringFrequency ||
          !allowedFrequencies.includes(recurringFrequency))
      ) {
        return next(
          new ErrorHandler(
            "Invalid recurrence frequency. Allowed: once, daily, weekly, monthly.",
            400
          )
        );
      }

      // Start transaction for creating both models
      const t = await sequelize.transaction();

      try {
        // First create the TaskTemplate record
        const taskTemplate = await models.TaskTemplate.create(
          {
            title: trimmedTitle,
            description,
            image, // This is optional
          },
          { transaction: t }
        );

        // Check for existing task with same child, title, and dueDateTime
        if (taskDueDateTime) {
          const existingTask = await models.Task.findOne({
            where: {
              childId,
              taskTemplateId: taskTemplate.id,
              dueDate: taskDueDateTime,
            },
            include: [
              {
                model: models.TaskTemplate,
                where: { title: trimmedTitle },
              },
            ],
          });

          if (existingTask) {
            await t.rollback();
            return next(
              new ErrorHandler(
                "Duplicate task for same child and time already exists.",
                400
              )
            );
          }
        }

        // Create the Task record linked to TaskTemplate
        const newTask = await models.Task.create(
          {
            taskTemplateId: taskTemplate.id,
            coinReward,
            difficultyLevel,
            childId,
            parentId,
            dueDate: taskDueDateTime || null,
            dueTime: dueTime || "00:00", // Default to "00:00" if not provided
            duration: duration || null,
            isRecurring: isRecurring || false,
            recurringFrequency: isRecurring ? recurringFrequency : "once",
            parentTaskId: null, // This is the original task
          },
          { transaction: t }
        );

        // Create notification for child
        await models.Notification.create(
          {
            type: "task_reminder",
            message: `New task assigned: ${trimmedTitle}`,
            recipientType: "child",
            recipientId: childId,
            relatedItemType: "task",
            relatedItemId: newTask.id,
          },
          { transaction: t }
        );

        await t.commit();

        // Return the combined data
        return res.status(201).json({
          message: "Task created successfully",
          data: {
            title: taskTemplate.title,
            description: taskTemplate.description,
            image: taskTemplate.image,
            ...newTask.dataValues,
          },
        });
      } catch (error) {
        await t.rollback();
        throw error;
      }
    } catch (error) {
      console.error("Error creating task:", error);
      return res
        .status(500)
        .json({ message: "Failed to create task", error: error.message });
    }
  });

  //---------------Task Analytics Function-------------------------------
  const getTaskAnalytics = asyncHandler(async (req, res, next) => {
    try {
      const parentId = req.parent?.id;
      const userType = req.parent ? "parent" : "child";
      const userId = parentId || req.child?.id;

      if (!userId) {
        return next(new ErrorHandler("Invalid authentication token", 401));
      }

      // Base query conditions
      let whereClause = {};
      if (userType === "parent") {
        whereClause.parentId = userId;
      } else {
        whereClause.childId = userId;
      }

      // Get analytics data
      const analytics = await Promise.all([
        // Total tasks
        models.Task.count({ where: whereClause }),
        // Status distribution
        models.Task.findAll({
          where: whereClause,
          attributes: [
            "status",
            [sequelize.fn("COUNT", sequelize.col("status")), "count"],
          ],
          group: ["status"],
        }),
        // Completion rate (completed + approved / total)
        models.Task.count({
          where: {
            ...whereClause,
            status: ["completed", "approved"],
          },
        }),
        // Average coin rewards by difficulty
        models.Task.findAll({
          where: whereClause,
          attributes: [
            "difficultyLevel",
            [sequelize.fn("AVG", sequelize.col("coinReward")), "avgReward"],
          ],
          group: ["difficultyLevel"],
        }),
        // Recurring vs non-recurring tasks
        models.Task.findAll({
          where: whereClause,
          attributes: [
            "isRecurring",
            [sequelize.fn("COUNT", sequelize.col("isRecurring")), "count"],
          ],
          group: ["isRecurring"],
        }),
      ]);

      const [
        totalTasks,
        statusDistribution,
        completedTasks,
        avgRewards,
        recurringDistribution,
      ] = analytics;

      // Format response
      const response = {
        totalTasks,
        statusDistribution: statusDistribution.reduce(
          (acc, item) => ({
            ...acc,
            [item.status]: item.get("count"),
          }),
          {}
        ),
        completionRate:
          totalTasks > 0
            ? ((completedTasks / totalTasks) * 100).toFixed(2) + "%"
            : "0%",
        averageRewardsByDifficulty: avgRewards.reduce(
          (acc, item) => ({
            ...acc,
            [item.difficultyLevel]: parseFloat(item.get("avgReward")).toFixed(
              2
            ),
          }),
          {}
        ),
        taskTypeDistribution: recurringDistribution.reduce(
          (acc, item) => ({
            ...acc,
            [item.isRecurring ? "recurring" : "non-recurring"]:
              item.get("count"),
          }),
          {}
        ),
      };

      return res.status(200).json({
        success: true,
        message: "Task analytics retrieved successfully",
        data: response,
      });
    } catch (error) {
      console.error("Error fetching task analytics:", error);
      return next(
        new ErrorHandler(error.message || "Failed to fetch task analytics", 500)
      );
    }
  });

  //---------------Task Listing with Filtering Function-------------------------
  const listTasks = asyncHandler(async (req, res, next) => {
    try {
      // Determine user type from decoded token
      const userType =
        req.user?.obj?.type || req.child?.obj?.type || req.parent?.obj?.type;
      const userId =
        req.user?.obj?.id || req.child?.obj?.id || req.parent?.obj?.id;

      if (!userType || !userId) {
        return next(new ErrorHandler("Invalid authentication token", 401));
      }
      console.log(userId);

      // Extract query parameters for filtering
      const {
        status,
        difficultyLevel,
        isRecurring,
        dueDateFrom,
        dueDateTo,
        minCoinReward,
        maxCoinReward,
        childId,
        sortBy = "dueDate",
        sortOrder = "ASC",
        page = 1,
        limit = 10,
      } = req.query;

      // if (userType === "child") {
      //   taskQuery.where.childId = userId;
      // } else if (userType === "parent") {
      //   taskQuery.where.parentId = userId;
      // } else {
      //   return next(new ErrorHandler("Invalid user type", 403));
      // }

      // Build where clause
      let whereClause = {};
      if (userType === "parent") {
        whereClause.parentId = userId;
        if (childId) whereClause.childId = childId;
      } else {
        whereClause.childId = userId;
      }

      // Add filters
      if (status) {
        const statuses = status
          .split(",")
          .filter((s) =>
            ["assigned", "completed", "approved", "rejected"].includes(s)
          );
        if (statuses.length) whereClause.status = statuses;
      }
      if (difficultyLevel) {
        const levels = difficultyLevel
          .split(",")
          .filter((l) => ["easy", "medium", "hard"].includes(l));
        if (levels.length) whereClause.difficultyLevel = levels;
      }
      if (isRecurring !== undefined) {
        whereClause.isRecurring = isRecurring === "true";
      }
      if (dueDateFrom || dueDateTo) {
        whereClause.dueDate = {};
        if (dueDateFrom)
          whereClause.dueDate[db.Sequelize.Op.gte] = new Date(dueDateFrom);
        if (dueDateTo)
          whereClause.dueDate[db.Sequelize.Op.lte] = new Date(dueDateTo);
      }
      if (minCoinReward || maxCoinReward) {
        whereClause.coinReward = {};
        if (minCoinReward)
          whereClause.coinReward[db.Sequelize.Op.gte] = parseInt(minCoinReward);
        if (maxCoinReward)
          whereClause.coinReward[db.Sequelize.Op.lte] = parseInt(maxCoinReward);
      }

      // Validate sorting
      const validSortFields = [
        "dueDate",
        "coinReward",
        "createdAt",
        "difficultyLevel",
      ];
      const sortField = validSortFields.includes(sortBy) ? sortBy : "dueDate";
      const validSortOrders = ["ASC", "DESC"];
      const order = validSortOrders.includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "ASC";

      // Calculate pagination
      const offset = (parseInt(page) - 1) * parseInt(limit);

      // Fetch tasks
      const { count, rows } = await models.Task.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: models.TaskTemplate,
            attributes: ["title", "description", "image"],
          },
          {
            model: models.Child,
            attributes: ["id", "name"],
          },
        ],
        order: [[sortField, order]],
        limit: parseInt(limit),
        offset,
        attributes: [
          "id",
          "coinReward",
          "difficultyLevel",
          "status",
          "dueDate",
          "dueTime",
          "duration",
          "isRecurring",
          "recurringFrequency",
          "completedAt",
        ],
      });

      // Format response
      const tasks = rows.map((task) => ({
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
        completedAt: task.completedAt,
        child: task.Child ? { id: task.Child.id, name: task.Child.name } : null,
      }));

      return res.status(200).json({
        success: true,
        message: "Tasks retrieved successfully",
        data: {
          tasks,
          pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(count / limit),
          },
        },
      });
    } catch (error) {
      console.error("Error listing tasks:", error);
      return next(
        new ErrorHandler(error.message || "Failed to list tasks", 500)
      );
    }
  });

  // ------------get all task template------------------------------------
  const getAllTaskTemplate = asyncHandler(async (req, res, next) => {
    try {
      const taskTemplates = await models.TaskTemplate.findAll({
        // where: { isTemplate: true },
        order: [["createdAt", "DESC"]],
        attributes: ["id", "title", "description", "image"],
        // include: [
        //   {
        //     model: models.Task,
        //     attributes: ["id", "coinReward", "difficultyLevel"],
        //     where: { isRecurring: false },
        //     required: false,
        //   },
        // ],
      });
      if (!taskTemplates || taskTemplates.length === 0) {
        return next(new ErrorHandler("No task templates found", 404));
      }
      return res.status(200).json({
        success: true,
        message: "Task templates fetched successfully",
        data: taskTemplates,
      });
    } catch (error) {
      console.error("Error fetching task templates:", error);
      return next(
        new ErrorHandler(error.message || "Failed to fetch task templates", 500)
      );
    }
  });

  // ------------unified task status update---------------------------------
  const updateTaskStatus = asyncHandler(async (req, res, next) => {
    try {
      const { taskId } = req.params;
      const { status, reason } = req.body; // status can be 'completed', 'approved', 'rejected'

      // Validate status values
      const allowedStatuses = ["completed", "approved", "rejected"];
      if (!status || !allowedStatuses.includes(status)) {
        return next(
          new ErrorHandler(
            "Invalid status. Allowed values: completed, approved, rejected",
            400
          )
        );
      }

      // Determine user type from decoded token
      const userType =
        req.user?.obj?.type || req.child?.obj?.type || req.parent?.obj?.type;
      const userId =
        req.user?.obj?.id || req.child?.obj?.id || req.parent?.obj?.id;

      if (!userType || !userId) {
        return next(new ErrorHandler("Invalid authentication token", 401));
      }

      // Find task with appropriate conditions based on user type
      let taskQuery = {
        where: { id: taskId },
        include: [
          { model: models.Child, attributes: ["id", "name", "coinBalance"] },
          {
            model: models.TaskTemplate,
            attributes: ["id", "title", "description", "image"],
          },
        ],
      };

      if (userType === "child") {
        taskQuery.where.childId = userId;
      } else if (userType === "parent") {
        taskQuery.where.parentId = userId;
      } else {
        return next(new ErrorHandler("Invalid user type", 403));
      }

      // Find task with child details for coin operations
      const task = await models.Task.findOne(taskQuery);

      if (!task) {
        return next(new ErrorHandler("Task not found or not accessible", 404));
      }

      // Status-specific validations and logic
      if (status === "completed") {
        // Child marking task as complete
        if (userType !== "child") {
          return next(
            new ErrorHandler("Only children can mark tasks as completed", 403)
          );
        }

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
          message: `Task '${task.taskTemplate.title}' marked as completed by ${task.Child.name} and waiting for approval`,
          recipientType: "parent",
          recipientId: task.parentId,
          relatedItemType: "task",
          relatedItemId: task.id,
        });

        return res.status(200).json({
          status: true,
          message: "Task marked as completed",
          data: {
            ...task.dataValues,
            title: task.TaskTemplate.title,
            description: task.TaskTemplate.description,
            image: task.TaskTemplate.image,
          },
        });
      } else if (status === "approved") {
        // Parent approving task
        if (userType !== "parent") {
          return next(new ErrorHandler("Only parents can approve tasks", 403));
        }

        if (task.status !== "completed") {
          return next(
            new ErrorHandler("Task must be in completed state to approve", 400)
          );
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
              description: `Reward for completing task: ${task.TaskTemplate.title}`,
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
              task.recurringFrequency,
              task.dueTime
            );

            // Create next task instance
            await models.Task.create(
              {
                taskTemplateId: task.taskTemplateId, // Link to the same task template
                coinReward: task.coinReward,
                difficultyLevel: task.difficultyLevel,
                childId: task.childId,
                parentId: task.parentId,
                dueDate: nextDueDate,
                dueTime: task.dueTime,
                duration: task.duration,
                isRecurring: true,
                recurringFrequency: task.recurringFrequency,
                parentTaskId: task.parentTaskId || task.id, // Link to the original task
              },
              { transaction: t }
            );
          }

          // Notify child
          await models.Notification.create(
            {
              type: "task_approval",
              message: `Your task '${task.taskTemplate.title}' was approved! You earned ${task.coinReward} Super Coins.`,
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
              task: {
                ...task.dataValues,
                title: task.taskTemplateId.title,
                description: task.taskTemplate.description,
                image: task.taskTemplate.image,
              },
              coinsAwarded: task.coinReward,
              newBalance: child.coinBalance + task.coinReward,
            },
          });
        } catch (error) {
          await t.rollback();
          throw error;
        }
      } else if (status === "rejected") {
        // Parent rejecting task
        if (userType !== "parent") {
          return next(new ErrorHandler("Only parents can reject tasks", 403));
        }

        if (task.status !== "completed") {
          return next(
            new ErrorHandler("Task must be in completed state to reject", 400)
          );
        }

        // Update task status
        await task.update({ status: "rejected" });

        // Notify child
        await models.Notification.create({
          type: "task_approval",
          message: `Your task '${task.taskTemplate.title}' was not approved. ${
            reason ? "Reason: " + reason : ""
          }`,
          recipientType: "child",
          recipientId: task.childId,
          relatedItemType: "task",
          relatedItemId: task.id,
        });

        return res.status(200).json({
          message: "Task rejected",
          data: {
            ...task.dataValues,
            title: task.taskTemplate.title,
            description: task.taskTemplate.description,
            image: task.taskTemplate.image,
          },
        });
      }
    } catch (error) {
      console.error("Error updating task status:", error);
      return next(
        new ErrorHandler(error.message || "Failed to update task status", 500)
      );
    }
  });

  //------------------------Update Task-------------------------------------------
  const updateTask = asyncHandler(async (req, res, next) => {
    try {
      const { taskId } = req.params;
      const parentId = req.parent.id;
      const {
        title,
        duration,
        coinReward,
        difficultyLevel,
        recurringFrequency,
        dueDate,
        dueTime,
      } = req.body;

      // Find task and verify parent ownership
      const task = await models.Task.findOne({
        where: { id: taskId, parentId },
        include: [{ model: models.TaskTemplate, required: true }],
      });

      if (!task || !task.TaskTemplate) {
        return next(
          new ErrorHandler("Task or associated TaskTemplate not found", 404)
        );
      }

      // Only allow updates if task is in 'assigned' status
      if (task.status !== "assigned") {
        return next(
          new ErrorHandler("Can only update tasks in 'assigned' status", 400)
        );
      }

      // Start transaction
      const t = await sequelize.transaction();

      try {
        // Update TaskTemplate if title is provided
        if (title) {
          const trimmedTitle = title.trim();
          // Validate title
          if (
            !trimmedTitle ||
            /^\d+$/.test(trimmedTitle) ||
            /^[^a-zA-Z0-9]+$/.test(trimmedTitle)
          ) {
            await t.rollback();
            return next(
              new ErrorHandler(
                "Invalid title. Must contain letters and not be empty, numeric-only, or special characters only.",
                400
              )
            );
          }

          // Check for duplicate title for same child and due date
          if (task.dueDate) {
            const existingTask = await models.Task.findOne({
              where: {
                childId: task.childId,
                dueDate: task.dueDate,
                id: { [db.Sequelize.Op.ne]: taskId },
              },
              include: [
                {
                  model: models.TaskTemplate,
                  where: { title: trimmedTitle },
                },
              ],
            });

            if (existingTask) {
              await t.rollback();
              return next(
                new ErrorHandler(
                  "Task with same title and due date already exists for this child",
                  400
                )
              );
            }
          }

          await task.TaskTemplate.update(
            { title: trimmedTitle },
            { transaction: t }
          );
        }

        // Prepare update object for Task
        const updateData = {};

        // Validate and add coinReward
        if (coinReward !== undefined) {
          if (typeof coinReward !== "number" || coinReward <= 0) {
            await t.rollback();
            return next(
              new ErrorHandler("Coin reward must be a positive number", 400)
            );
          }
          updateData.coinReward = coinReward;
        }

        // Validate and add difficultyLevel
        if (difficultyLevel !== undefined) {
          const allowedDifficulties = ["easy", "medium", "hard"];
          if (!allowedDifficulties.includes(difficultyLevel)) {
            await t.rollback();
            return next(
              new ErrorHandler(
                "Invalid difficulty level. Allowed: easy, medium, hard",
                400
              )
            );
          }
          updateData.difficultyLevel = difficultyLevel;
        }

        // Validate and add duration
        if (duration !== undefined) {
          const parsedDuration =
            typeof duration === "string" ? parseInt(duration, 10) : duration;
          if (isNaN(parsedDuration) || typeof parsedDuration !== "number") {
            await t.rollback();
            return next(new ErrorHandler("Duration must be a number", 400));
          }
          if (parsedDuration <= 0) {
            await t.rollback();
            return next(
              new ErrorHandler(
                "Duration must be a positive number in minutes",
                400
              )
            );
          }
          const allowedDurations = [5, 15, 30, 60, 120];
          if (!allowedDurations.includes(parsedDuration)) {
            await t.rollback();
            return next(
              new ErrorHandler(
                `Duration must be one of: ${allowedDurations.join(", ")}`,
                400
              )
            );
          }
          updateData.duration = parsedDuration;
        }

        // Validate recurrence
        if (recurringFrequency !== undefined) {
          const allowedFrequencies = ["once", "daily", "weekly", "monthly"];
          if (!allowedFrequencies.includes(recurringFrequency)) {
            await t.rollback();
            return next(
              new ErrorHandler(
                "Invalid recurrence frequency. Allowed: once, daily, weekly, monthly",
                400
              )
            );
          }
          updateData.recurringFrequency = recurringFrequency;
          updateData.isRecurring = recurringFrequency !== "once";
        }

        // Validate and add dueDate/dueTime
        if (dueDate || dueTime) {
          if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
            await t.rollback();
            return next(
              new ErrorHandler(
                "Invalid dueDate format. Expected YYYY-MM-DD",
                400
              )
            );
          }

          if (dueTime && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(dueTime)) {
            await t.rollback();
            return next(
              new ErrorHandler(
                "Invalid dueTime format. Expected HH:MM (24-hour)",
                400
              )
            );
          }

          const taskDueDateTime = new Date(
            `${dueDate || task.dueDate.toISOString().split("T")[0]}T${
              dueTime || task.dueTime || "00:00"
            }:00+05:30`
          );

          if (isNaN(taskDueDateTime.getTime())) {
            await t.rollback();
            return next(
              new ErrorHandler("Invalid due date or time format", 400)
            );
          }

          // For non-recurring tasks, check if date is in future
          if (!updateData.isRecurring && !task.isRecurring) {
            const now = new Date();
            const istOffset = 5.5 * 60 * 60 * 1000;
            const nowIST = new Date(now.getTime() + istOffset);
            if (taskDueDateTime < nowIST) {
              await t.rollback();
              return next(
                new ErrorHandler(
                  "Due date and time cannot be in the past for non-recurring tasks",
                  400
                )
              );
            }
          }

          updateData.dueDate = taskDueDateTime;
          updateData.dueTime = dueTime || task.dueTime || "00:00";
        }

        // Update task
        await task.update(updateData, { transaction: t });

        // Reload task with TaskTemplate to ensure fresh data
        await task.reload({
          include: [{ model: models.TaskTemplate, required: true }],
          transaction: t,
        });

        // Notify child about task update
        await models.Notification.create(
          {
            type: "task_update",
            message: `Task '${
              task.TaskTemplate?.title || "Task"
            }' has been updated`,
            recipientType: "child",
            recipientId: task.childId,
            relatedItemType: "task",
            relatedItemId: task.id,
          },
          { transaction: t }
        );

        await t.commit();

        return res.status(200).json({
          message: "Task updated successfully",
          data: {
            ...task.dataValues,
          },
        });
      } catch (error) {
        await t.rollback();
        throw error;
      }
    } catch (error) {
      console.error("Error updating task:", error);
      return next(
        new ErrorHandler(error.message || "Failed to update task", 500)
      );
    }
  });

  //---------------------Delete Task---------------------------------------------
  const deleteTask = asyncHandler(async (req, res, next) => {
    try {
      const { taskId } = req.params;
      const parentId = req.parent.id;

      // Find task and verify parent ownership
      const task = await models.Task.findOne({
        where: { id: taskId, parentId },
        include: [{ model: models.TaskTemplate }],
      });

      if (!task) {
        return next(new ErrorHandler("Task not found or not accessible", 404));
      }

      // Start transaction
      const t = await sequelize.transaction();

      try {
        // If task is a parent task (has parentTaskId null or is referenced)
        if (!task.parentTaskId) {
          // Delete all related recurring tasks
          await models.Task.destroy({
            where: {
              [db.Sequelize.Op.or]: [{ parentTaskId: taskId }, { id: taskId }],
            },
            transaction: t,
          });
        } else {
          // Delete only this specific task
          await task.destroy({ transaction: t });
        }

        // Delete associated TaskTemplate
        await models.TaskTemplate.destroy({
          where: { id: task.taskTemplateId },
          transaction: t,
        });

        // Delete associated notifications
        await models.Notification.destroy({
          where: {
            relatedItemType: "task",
            relatedItemId: taskId,
          },
          transaction: t,
        });

        // Notify child about task deletion
        await models.Notification.create(
          {
            type: "task_deletion",
            message: `Task '${task.TaskTemplate.title}' has been deleted`,
            recipientType: "child",
            recipientId: task.childId,
            relatedItemType: "task",
            relatedItemId: null,
          },
          { transaction: t }
        );

        await t.commit();

        return res.status(200).json({
          success: true,
          message: "Task and related data deleted successfully",
        });
      } catch (error) {
        await t.rollback();
        throw error;
      }
    } catch (error) {
      console.error("Error deleting task:", error);
      return next(
        new ErrorHandler(error.message || "Failed to delete task", 500)
      );
    }
  });

module.exports = {
    createTask,
    getTaskAnalytics,
    listTasks,
    getAllTaskTemplate,
    updateTaskStatus,
    updateTask,
    deleteTask,
};
