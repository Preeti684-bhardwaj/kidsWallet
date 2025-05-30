const models = require("../Modals/index");
const { Op , literal } = require("sequelize");
const db = require("../Configs/db/DbConfig");
const sequelize = db.sequelize;
const moment = require("moment");
const {
  calculateDefaultReward,
  sortRecurrenceDates,
  validateQueryParams
} = require("../Utils/taskHelper");
const { v4: uuidv4, validate: isValidUUID } = require('uuid');
const ErrorHandler = require("../Utils/errorHandle");
const asyncHandler = require("../Utils/asyncHandler");

//---------------------Create a new task template (Both Parent and Admin)------------------------------------
const createTaskTemplate = asyncHandler(async (req, res, next) => {
  const { title, description, image } = req.body;
  
  try {
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
    
    // Check if task template with same title already exists
    const existingTemplate = await models.TaskTemplate.findOne({
      where: { title: trimmedTitle },
    });
    if (existingTemplate) {
      return next(
        new ErrorHandler("Task template with this title already exists", 400)
      );
    }
    
    // Prepare data based on user type
    let taskTemplateData = {
      title: trimmedTitle,
      description,
      image
    };
    
    if (req.userType === "parent") {
      taskTemplateData.userId = req.parent.id;
      taskTemplateData.adminId = null; // Explicitly set to null
      console.log("Creating template for parent:", req.parent.id);
    } else if (req.userType === "admin") {
      taskTemplateData.adminId = req.admin.id;
      taskTemplateData.userId = null; // Explicitly set to null
      console.log("Creating template for admin:", req.admin.id);
    } else {
      return next(new ErrorHandler("Invalid user type", 400));
    }
    
    const taskTemplate = await models.TaskTemplate.create(taskTemplateData);
    
    return res.status(201).json({
      success: true,
      message: "Task template created successfully",
      data: {
        id: taskTemplate.id,
        title: taskTemplate.title,
        description: taskTemplate.description,
        image: taskTemplate.image,
        userId: taskTemplate.userId,
        adminId: taskTemplate.adminId,
        createdBy: req.userType
      },
    });
  } catch (error) {
    console.error("Error creating task template:", error);
    return next(new ErrorHandler(error.message || "Failed to create task template", 500));
  }
});

//--------------------Get all task templates---------------------------------------------------------
const getAllTaskTemplate = asyncHandler(async (req, res, next) => {
  try {
    let whereCondition = {};
    
    if (req.userType === "parent") {
      // For parents: get templates created by this parent OR by any admin
      whereCondition = {
        [Op.or]: [
          { 
            userId: req.parent.id,
            adminId: null // Templates created by this parent
          },
          { 
            adminId: { [Op.ne]: null },
            userId: null // Templates created by any admin (default templates)
          }
        ]
      };
    } else if (req.userType === "admin") {
      // For admins: get only templates created by this specific admin
      whereCondition = {
        adminId: req.admin.id,
        userId: null // Only templates created by this admin
      };
    } else {
      return next(new ErrorHandler("Invalid user type", 400));
    }
    
    const taskTemplates = await models.TaskTemplate.findAll({
      where: whereCondition,
      order: [["createdAt", "DESC"]],
      attributes: ["id", "title", "description", "image", "userId", "adminId"],
      include: [
        {
          model: models.Parent,
          attributes: ["id", "email"], // Include parent info if exists
          required: false
        },
        {
          model: models.Admin,
          attributes: ["id", "email"], // Include admin info if exists
          required: false
        }
      ]
    });
    
    if (!taskTemplates || taskTemplates.length === 0) {
      return next(new ErrorHandler("No task templates found", 404));
    }
    
    // Add createdBy field for better understanding
    const templatesWithCreator = taskTemplates.map(template => {
      const templateData = template.toJSON();
      templateData.createdBy = templateData.userId ? "parent" : "admin";
      return templateData;
    });
    
    return res.status(200).json({
      success: true,
      message: "Task templates fetched successfully",
      data: templatesWithCreator,
    });
  } catch (error) {
    console.error("Error fetching task templates:", error);
    return next(
      new ErrorHandler(error.message || "Failed to fetch task templates", 500)
    );
  }
});
//---------------- Create a new task (Parent only)-----------------------------
const createTask = asyncHandler(async (req, res, next) => {
  const {
    taskTemplateId,
    childId,
    dueTime, // Format: HH:MM
    duration,
    recurrence,
    recurrenceDates, // Array of dates in DD-MM-YYYY format
    rewardCoins,
    difficulty,
    notificationEnabled,
  } = req.body;
  const parentId = req.parent.id;

  try {
    // Validate task template
    const taskTemplate = await models.TaskTemplate.findByPk(taskTemplateId);
    if (!taskTemplate) {
      return next(new ErrorHandler('Task template not found', 404));
    }

    // Validate child
    const child = await models.Child.findOne({
      where: { id: childId, parentId },
    });
    if (!child) {
      return next(new ErrorHandler('Child not found or not associated with this parent', 404));
    }

    // Validate recurrence
    const allowedRecurrences = ['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY'];
    if (!allowedRecurrences.includes(recurrence)) {
      return next(
        new ErrorHandler('Invalid recurrence. Allowed: ONCE, DAILY, WEEKLY, MONTHLY', 400)
      );
    }

    // Validate dueTime
    if (dueTime && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(dueTime)) {
      return next(new ErrorHandler('Invalid dueTime format. Expected HH:MM (24-hour)', 400));
    }

    // Validate duration
    if (duration !== undefined) {
      const parsedDuration = typeof duration === 'string' ? parseInt(duration, 10) : duration;
      if (isNaN(parsedDuration) || parsedDuration < 1) {
        return next(new ErrorHandler('Duration must be a positive number in minutes', 400));
      }
    }

    // Validate and set rewardCoins
    let finalReward;
    if (rewardCoins === undefined || rewardCoins === null) {
      finalReward = calculateDefaultReward(taskTemplate.title, difficulty || 'EASY');
    } else {
      finalReward = Number(rewardCoins);
      if (isNaN(finalReward) || finalReward < 0) {
        return next(new ErrorHandler('Reward coins must be a non-negative number', 400));
      }
    }

    // Handle recurrenceDates
    let validDates = [];
    if (!recurrenceDates || !Array.isArray(recurrenceDates)) {
      return next(
        new ErrorHandler('recurrenceDates must be a non-empty array', 400)
      );
    }

    // Remove duplicates and validate date format
    const uniqueDates = [...new Set(recurrenceDates)];
    const today = moment().tz('Asia/Kolkata').startOf('day');

    // Validate number of dates based on recurrence type
    if (recurrence === 'ONCE' || recurrence === 'DAILY') {
      if (uniqueDates.length !== 1) {
        return next(
          new ErrorHandler(`${recurrence} recurrence requires exactly one date`, 400)
        );
      }
    } else if (recurrence === 'WEEKLY') {
      // if (uniqueDates.length < 7) {
      //   return next(
      //     new ErrorHandler('WEEKLY recurrence requires at least 7 dates', 400)
      //   );
      // }
      if (uniqueDates.length > 7) {
        return next(
          new ErrorHandler('WEEKLY recurrence cannot have more than 7 dates', 400)
        );
      }
    } else if (recurrence === 'MONTHLY') {
      // Get the month from the first date to validate number of days
      if (uniqueDates.length === 0) {
        return next(
          new ErrorHandler('MONTHLY recurrence requires at least one date to determine the month', 400)
        );
      }
      const firstDate = moment.tz(uniqueDates[0], 'DD-MM-YYYY', 'Asia/Kolkata');
      if (!firstDate.isValid()) {
        return next(new ErrorHandler(`Invalid date format: ${uniqueDates[0]}`, 400));
      }
      const daysInMonth = firstDate.daysInMonth();
      // if (uniqueDates.length < daysInMonth) {
      //   return next(
      //     new ErrorHandler(`MONTHLY recurrence requires at least ${daysInMonth} dates for the specified month`, 400)
      //   );
      // }
      if (uniqueDates.length > daysInMonth) {
        return next(
          new ErrorHandler(`MONTHLY recurrence cannot have more than ${daysInMonth} dates for the specified month`, 400)
        );
      }
    }

    for (const date of uniqueDates) {
      if (!/^\d{2}-\d{2}-\d{4}$/.test(date)) {
        return next(
          new ErrorHandler(`Invalid date format: ${date}. Expected DD-MM-YYYY`, 400)
        );
      }
      const parsedDate = moment.tz(date, 'DD-MM-YYYY', 'Asia/Kolkata');
      if (!parsedDate.isValid()) {
        return next(new ErrorHandler(`Invalid date: ${date}`, 400));
      }
      // Block past dates for all recurrences
      if (parsedDate.isBefore(today)) {
        return next(
          new ErrorHandler(`Past date ${date} is not allowed in recurrenceDates`, 400)
        );
      }
      // For MONTHLY, ensure all dates are in the same month
      if (recurrence === 'MONTHLY') {
        const firstDate = moment.tz(uniqueDates[0], 'DD-MM-YYYY', 'Asia/Kolkata');
        if (!parsedDate.isSame(firstDate, 'month')) {
          return next(
            new ErrorHandler(`All MONTHLY recurrence dates must be in the same month as ${uniqueDates[0]}`, 400)
          );
        }
      }
      validDates.push(date);
    }

    // Sort dates
    validDates = sortRecurrenceDates(validDates);

    const isRecurring = recurrence !== 'ONCE';
    const createdTasks = [];

    const t = await sequelize.transaction();
    try {
      // Create task instances for each valid date
      for (const date of validDates) {
        const dueDateTime = moment
          .tz(`${date} ${dueTime || '00:00'}:00`, 'DD-MM-YYYY HH:mm:ss', 'Asia/Kolkata')
          .toDate();

        // Check for existing task to avoid duplicates
        const existingTask = await models.Task.findOne({
          where: {
            taskTemplateId,
            childId,
            dueDate: dueDateTime,
          },
          transaction: t,
        });

        if (existingTask) {
          continue; // Skip duplicate date
        }
        // Determine task status based on date
        const taskDate = moment.tz(date, 'DD-MM-YYYY', 'Asia/Kolkata');
        const status = taskDate.isSame(today, 'day') ? 'PENDING' : 'UPCOMING';

        // Create task
        const task = await models.Task.create(
          {
            taskTemplateId,
            parentId,
            childId,
            dueDate: dueDateTime,
            dueTime: dueTime || '00:00',
            duration,
            recurrence,
            rewardCoins: finalReward,
            difficulty: difficulty || 'EASY',
            isRecurring,
            status,
            notificationEnabled: notificationEnabled || false,
          },
          { transaction: t }
        );
        // Create notification if enabled
        if (notificationEnabled) {
          await models.Notification.create(
            {
              relatedItemId: task.id,
              relatedItemType: "task",
              recipientId: childId,
              recipientType: "child",
              message: `New task "${taskTemplate.title}" assigned for ${moment(
                dueDateTime
              ).format("DD-MM-YYYY HH:mm")}`,
              type: "task_reminder",
            },
            { transaction: t }
          );
        }

        createdTasks.push({
          id: task.id,
          dueDate: task.dueDate,
          dueTime: task.dueTime,
          status: task.status,
        });
      }

      await t.commit();

      if (createdTasks.length === 0) {
        return next(new ErrorHandler('No new tasks created due to duplicates or invalid dates', 400));
      }

      return res.status(201).json({
        success: true,
        message: 'Tasks created successfully',
        data: {
          taskTemplateId,
          title: taskTemplate.title,
          description: taskTemplate.description,
          image: taskTemplate.image,
          tasks: createdTasks,
        },
      });
    } catch (error) {
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error creating task:', error);
    return next(new ErrorHandler(error.message || 'Failed to create task', 500));
  }
});

//--------------------------listing of task-----------------------------
const listTasks = asyncHandler(async (req, res, next) => {
  try {
    // Determine user type and ID
    const userType = req.parent.obj ? "parent" : "child";
    const userId = req.parent?.obj?.id || req.child?.obj?.id;

    if (!userType || !userId) {
      return next(new ErrorHandler("Invalid authentication token", 401));
    }
    console.log(userId);

    // Extract query parameters for filtering
  
    // Extract query parameters for filtering
    const { status, difficulty, dueDateFrom, dueDateTo, childId} = req.query;

    // Validate query parameters
    const { errors, page: validatedPage, limit: validatedLimit } = validateQueryParams(req.query);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: 'Validation errors', errors });
    }

    const where = {};
    const taskInclude = [
      {
        model: models.TaskTemplate,
        attributes: ['id', 'title', 'description', 'image'],
      },
    ];

    // Apply filters
    if (status) where.status = status;
    if (difficulty) where.difficulty = difficulty;
    if (dueDateFrom || dueDateTo) {
      where.dueDate = {};
      if (dueDateFrom) where.dueDate[Op.gte] = new Date(dueDateFrom);
      if (dueDateTo) where.dueDate[Op.lte] = new Date(dueDateTo);
    }

    // Role-based logic
    if (userType=== 'parent') {
      // Verify parent has access to the child (if childId is provided)
      if (childId) {
        const child = await models.Child.findOne({ where: { id: childId, parentId:userId} });
        if (!child) {
          return res.status(403).json({ success: false, message: 'Child not found or not authorized' });
        }
        where.childId = childId;
      } else {
        // Get all children of the parent
        const children = await models.Child.findAll({ where: { parentId: userId}, attributes: ['id'] });
        const childIds = children.map((child) => child.id);
        where.childId = { [Op.in]: childIds.length > 0 ? childIds : [null] }; // Handle no children
      }
    } else if (userType === 'child') {
      // Children can only see their own tasks
      where.childId = userId;
      if (childId && childId !== userId) {
        return res.status(403).json({ success: false, message: 'Unauthorized to view tasks for other children' });
      }
    } else {
      return res.status(403).json({ success: false, message: 'Invalid user role' });
    }

    // Fetch tasks with pagination
    const offset = (validatedPage - 1) * validatedLimit;
    const { count, rows: tasks } = await models.Task.findAndCountAll({
      where,
      include: taskInclude,
      offset,
      limit: validatedLimit,
      order: [['dueDate', 'ASC']],
    });

    // Format response to match task creation API
    const formattedTasks = tasks.map((task) => ({
      id: task.id,
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      status: task.status,
      taskTemplateId: task.taskTemplateId,
      title: task.TaskTemplate?.title,
      description: task.TaskTemplate?.description,
      image: task.TaskTemplate?.image,
      difficulty: task.difficulty,
      rewardCoins: task.rewardCoins,
      recurrence: task.recurrence,
      // Include additional fields for parents only
      ...(userType === 'parent' && {
        childId: task.childId,
        completedAt: task.completedAt,
        approvedAt: task.approvedAt,
        rejectedAt: task.rejectedAt,
        rejectionReason: task.rejectionReason,
      }),
    }));

    const response = {
      success: true,
      message: 'Tasks retrieved successfully',
      data: {
        tasks: formattedTasks,
        pagination: {
          total: count,
          page: validatedPage,
          limit: validatedLimit,
          totalPages: Math.ceil(count / validatedLimit),
        },
      },
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error listing tasks:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
});

// Mark task as completed (Child only)
const updateTaskStatus = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;
  const { status, reason } = req.body;
  // console.log(req.parent);
  console.log(req.child);

  const userType = req.parent?.obj?.id ? "parent" : req.child?.obj?.id ? "child" : null;
  const userId = req.parent?.obj?.id || req.child?.obj?.id;

  try {
    // Validate status
    const allowedStatuses = ["COMPLETED", "APPROVED", "REJECTED"];
    if (!allowedStatuses.includes(status)) {
      return next(
        new ErrorHandler(
          "Invalid status. Allowed values: COMPLETED, APPROVED, REJECTED",
          400
        )
      );
    }

    // Validate user
    if (!userType || !userId) {
      return next(new ErrorHandler("Invalid authentication token", 401));
    }

    // Find task
    const taskQuery = {
      where: { id: taskId },
      include: [
        {
          model: models.TaskTemplate,
          attributes: ["id", "title", "description", "image"],
        },
        { model: models.Child, attributes: ["id", "name"] },
      ],
    };
    if (userType === "child") taskQuery.where.childId = userId;
    else taskQuery.where.parentId = userId;

    const task = await models.Task.findOne(taskQuery);
    if (!task) {
      return next(new ErrorHandler("Task not found or not accessible", 404));
    }
    console.log(task);

    // Store template and child data before any updates (FIX: Store these values before task.update())
    const taskTemplateTitle = task.TaskTemplate?.title;
    const childName = task.Child?.name;

    const t = await sequelize.transaction();
    try {
      if (status === "COMPLETED") {
        // Child marking task as completed
        if (userType !== "child") {
          return next(
            new ErrorHandler("Only children can mark tasks as completed", 403)
          );
        }
        if (task.status !== "PENDING") {
          return next(new ErrorHandler(`Task is already ${task.status}`, 400));
        }
        if (task.status !== "PENDING") {
          return next(
            new ErrorHandler("Only PENDING tasks can be marked as completed", 400)
          );
        }

        await task.update(
          { status: "COMPLETED", completedAt: new Date() },
          { transaction: t }
        );

        // Notify parent
        await models.Notification.create(
          {
            type: "task_completion",
            message: `Task '${taskTemplateTitle}' marked as completed by ${childName} and waiting for approval`,
            recipientType: "parent",
            recipientId: task.parentId,
            relatedItemType: "task",
            relatedItemId: task.id,
          },
          { transaction: t }
        );
      } else if (status === "APPROVED") {
        // Parent approving task
        if (userType !== "parent") {
          return next(new ErrorHandler("Only parents can approve tasks", 403));
        }
        if (task.status !== "COMPLETED") {
          return next(
            new ErrorHandler("Task must be completed to approve", 400)
          );
        }

        await task.update(
          { status: "APPROVED", approvedAt: new Date() },
          { transaction: t }
        );

        // Award coins (FIX: Use stored template title)
        await models.Transaction.create(
          {
            childId: task.childId,
            taskId: task.id,
            amount: task.rewardCoins,
            type: "credit",
            description: `Reward for completing task: ${taskTemplateTitle}`,
          },
          { transaction: t }
        );

        // Update streak
        const streak = await models.Streak.findOne({
          where: { childId: task.childId },
          transaction: t,
        });
        const today = moment().tz("Asia/Kolkata").startOf("day");
        if (streak) {
          const lastStreakDate = streak.lastTaskDate
            ? moment(streak.lastTaskDate).tz("Asia/Kolkata").startOf("day")
            : null;
          const streakCount =
            lastStreakDate && today.diff(lastStreakDate, "days") === 1
              ? streak.streakCount + 1
              : 1;

          await streak.update(
            { streakCount, lastTaskDate: today.toDate() },
            { transaction: t }
          );

          if (streakCount === 7) {
            await models.Transaction.create(
              {
                childId: task.childId,
                amount: 50,
                type: "streak_bonus",
                description: "Streak bonus for 7 consecutive days",
              },
              { transaction: t }
            );
            await streak.update({ streakCount: 0 }, { transaction: t });
            await models.Notification.create(
              {
                type: "streak_bonus",
                message: "Congratulations! You earned a 50-coin bonus for a 7-day streak!",
                recipientType: "child",
                recipientId: task.childId,
                relatedItemType: "task",
                relatedItemId: task.id
              },
              { transaction: t }
            );
          }
        } else {
          await models.Streak.create(
            {
              childId: task.childId,
              streakCount: 1,
              lastTaskDate: today.toDate(),
            },
            { transaction: t }
          );
        }

        // Create next instance for daily recurring tasks
        if (task.isRecurring && task.recurrence === "DAILY") {
          const nextDueDate = moment(task.dueDate)
            .tz("Asia/Kolkata")
            .add(1, "day")
            .toDate();
          const nextDueDateTime = moment
            .tz(
              `${nextDueDate.getFullYear()}-${
                nextDueDate.getMonth() + 1
              }-${nextDueDate.getDate()} ${task.dueTime}:00`,
              "YYYY-MM-DD HH:mm:ss",
              "Asia/Kolkata"
            )
            .toDate();

          const existingTask = await models.Task.findOne({
            where: {
              childId: task.childId,
              taskTemplateId: task.taskTemplateId,
              dueDate: nextDueDateTime,
            },
            transaction: t,
          });

          if (!existingTask) {
            await models.Task.create(
              {
                taskTemplateId: task.taskTemplateId,
                parentId: task.parentId,
                childId: task.childId,
                dueDate: nextDueDateTime,
                dueTime: task.dueTime,
                duration: task.duration,
                recurrence: task.recurrence,
                rewardCoins: task.rewardCoins,
                difficulty: task.difficulty,
                isRecurring: true,
                status: "PENDING",
                notificationEnabled: task.notificationEnabled,
              },
              { transaction: t }
            );
          }
        }

        // Notify child (FIX: Use stored template title)
        await models.Notification.create(
          {
            type: "task_approval",
            message: `Your task "${taskTemplateTitle}" was approved! You earned ${task.rewardCoins} coins.`,
            recipientType: "child",
            recipientId: task.childId,
            relatedItemType: "task",
            relatedItemId: task.id
          },
          { transaction: t }
        );
      } else if (status === "REJECTED") {
        // Parent rejecting task
        if (userType !== "parent") {
          return next(new ErrorHandler("Only parents can reject tasks", 403));
        }
        if (task.status !== "COMPLETED") {
          return next(
            new ErrorHandler("Task must be completed to reject", 400)
          );
        }

        await task.update(
          {
            status: "REJECTED",
            rejectedAt: new Date(),
            rejectionReason: reason,
          },
          { transaction: t }
        );

        // Reset streak
        const streak = await models.Streak.findOne({
          where: { childId: task.childId },
          transaction: t,
        });
        if (streak) {
          await streak.update({ streakCount: 0 }, { transaction: t });
        }

        // Notify child (FIX: Use stored template title)
        await models.Notification.create(
          {
            type: "task_rejection",
            message: `Your task "${taskTemplateTitle}" was rejected.${
              reason ? ` Reason: ${reason}` : ""
            }`,
            recipientType: "child",
            recipientId: task.childId,
            relatedItemType: "task",
            relatedItemId: task.id
          },
          { transaction: t }
        );
      }

      await t.commit();
      
      // For the response, use the stored values or fetch fresh data
      return res.status(200).json({
        success: true,
        message: `Task ${status.toLowerCase()} successfully`,
        data: {
          id: task.id,
          title: taskTemplateTitle,
          description: task.TaskTemplate?.description,
          image: task.TaskTemplate?.image,
          rewardCoins: task.rewardCoins,
          difficulty: task.difficulty,
          status: status, // Use the new status instead of task.status
          dueDate: task.dueDate,
          dueTime: task.dueTime,
          duration: task.duration,
          isRecurring: task.isRecurring,
          recurrence: task.recurrence,
          completedAt: task.completedAt,
          approvedAt: task.approvedAt,
          rejectedAt: task.rejectedAt,
          rejectionReason: task.rejectionReason,
        },
      });
    } catch (error) {
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error updating task status:", error);
    return next(
      new ErrorHandler(error.message || "Failed to update task status", 500)
    );
  }
});

// Update task reward coins (Parent only)
const updateTaskReward =asyncHandler( async (req, res,next) => {
  const { rewardCoins } = req.body;
  try {
    const task = await models.Task.findOne({
      where: { id: req.params.taskId, parentId: req.parent?.id },
      attributes: [
        "id",
        "taskTemplateId",
        "childId",
        "status",
        "rewardCoins",
        "dueDate",
        "dueTime",
        "duration",
        "recurrence",
        "difficulty",
        "isRecurring",
      ],
    });

    if (!task) {
      return next(new ErrorHandler("Task not found",404));
    }

    if (task.status === "COMPLETED" || task.status === "APPROVED") {
      return next(new ErrorHandler("Cannot update reward coins for a completed or approved task",400
      ));
    }

    if (rewardCoins < 0) {
      return next(new ErrorHandler("Reward coins cannot be negative",400));
    }

    await task.update({ rewardCoins });

    // Notify child of reward update
    const taskTemplate = await models.TaskTemplate.findByPk(
      task.taskTemplateId
    );
    await models.Notification.create({
      type: "reward_update",
      message: `Reward for task "${taskTemplate.title}" updated to ${rewardCoins} coins.`,
      recipientType: "child",
      recipientId: task.childId,
      relatedItemType: "task",
      relatedItemId: task.id,
    });

    return res.status(200).json({succes:true,message:"chores coin rewards updated successfully",data :task});
  } catch (error) {
    return next(new ErrorHandler(error.message ,500));
  }
});

// Delete a task (Parent only)
const deleteTask = asyncHandler(async (req, res,next) => {
  try {
    const task = await models.Task.findOne({
      where: {id: req.params.taskId, parentId: req.parent?.id },
    });

    if (!task) {
      return next(new ErrorHandler("Task not found or not associated with this parent",404));
    }

    if (task.status === "COMPLETED" || task.status === "APPROVED") {
     return next(new ErrorHandler("Cannot delete a completed or approved task" ,400));
    }

    const taskTemplate = await models.TaskTemplate.findByPk(
      task.taskTemplateId
    );

    // Notify child of task deletion
    await models.Notification.create({
      type: "task_deletion",
      message: `Task "${taskTemplate.title}" has been deleted by your parent.`,
      recipientType: "child",
      recipientId: task.childId,
      relatedItemType: "task",
      relatedItemId: task.id
    });

    await task.destroy();
    return res.status(200).json({ success:true,message: "Task deleted successfully" });
  } catch (error) {
   return next(new ErrorHandler(error.message ,500));
  }
});

/*
// Get all tasks for a child (Child only)
const getChildTasks = asyncHandler(async (req, res,next) => {
  try {
    const tasks = await models.Task.findAll({
      where: { childId: req.user.id },
      include: [{ model: models.TaskTemplate }],
    });
    res.json(tasks);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all tasks for a parent's children (Parent only)
const getParentTasks = asyncHandler(async (req, res,next) => {
  try {
    const tasks = await models.Task.findAll({
      where: { parentId: req.user.id },
      include: [{ model: models.TaskTemplate }, { model: models.Child }],
    });
    res.json(tasks);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
*/

/* //------------------------Update Task-------------------------------------------
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
  });*/ 


module.exports = {
  createTaskTemplate,
  getAllTaskTemplate,
  createTask,
  listTasks,
  // getChildTasks,
  // getParentTasks,
  updateTaskStatus,
  updateTaskReward,
  deleteTask,
};
