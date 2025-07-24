const models = require("../Modals/index");
const { Op, literal } = require("sequelize");
const db = require("../Configs/db/DbConfig");
const sequelize = db.sequelize;
const moment = require("moment");
const {
  calculateDefaultReward,
  sortRecurrenceDates,
  validateQueryParams,
} = require("../Utils/taskHelper");
const {
  isValidLength,
} = require("../Validators/parentValidation");
const { v4: uuidv4, validate: isValidUUID } = require("uuid");
const { uploadFile, deleteFile } = require("../Utils/cdnImplementation");
const ErrorHandler = require("../Utils/errorHandle");
const asyncHandler = require("../Utils/asyncHandler");

//---------------------Create a new task template (Both Parent and Admin)------------------------------------
const createTaskTemplate = asyncHandler(async (req, res, next) => {
  const { title } = req.body;

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
    if (/\s{2,}/.test(trimmedTitle) ){
      return next(
        new ErrorHandler("title should not contain consecutive spaces",400));
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

    // Handle image upload if file is provided
    let imageData = null;
    if (req.file) {
      try {
        const uploadResult = await uploadFile(req.file);
        imageData = {
          url: uploadResult.url,
          filename: uploadResult.filename,
          originalName: uploadResult.originalName,
          size: uploadResult.size,
          mimetype: uploadResult.mimetype,
        };
      } catch (uploadError) {
        console.error("Image upload error:", uploadError);
        return next(new ErrorHandler("Failed to upload image", 500));
      }
    }

    // Prepare data based on user type
    let taskTemplateData = {
      title: trimmedTitle,
      image: imageData,
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
        image: taskTemplate.image,
        userId: taskTemplate.userId,
        adminId: taskTemplate.adminId,
        createdBy: req.userType,
      },
    });
  } catch (error) {
    console.error("Error creating task template:", error);
    return next(
      new ErrorHandler(error.message || "Failed to create task template", 500)
    );
  }
});

//--------------------Get all task templates with filtering and pagination---------------------------------------------------------
const getAllTaskTemplate = asyncHandler(async (req, res, next) => {
  try {
    // Extract query parameters
    const {
      page = 1,
      limit = 10,
      search,
      createdBy, // 'parent', 'admin', or 'all'
      sortBy = "createdAt",
      sortOrder = "DESC",
      userId, // specific parent ID (admin only)
      adminId, // specific admin ID (admin only)
    } = req.query;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(Math.max(1, parseInt(limit)), 100); // Max 100 items per page
    const offset = (pageNum - 1) * limitNum;

    // Validate createdBy parameter
    const validCreatedByValues = ["parent", "admin", "all"];
    if (createdBy && !validCreatedByValues.includes(createdBy)) {
      return next(
        new ErrorHandler(
          "Invalid createdBy filter. Must be 'parent', 'admin', or 'all'",
          400
        )
      );
    }

    // Validate userId and adminId parameters (only for admins)
    if ((userId || adminId) && req.userType !== "admin") {
      return next(
        new ErrorHandler(
          "Only admins can filter by specific userId or adminId",
          403
        )
      );
    }

    // Base where condition based on user type and filters
    let whereCondition = {};

    if (req.userType === "parent") {
      // Handle createdBy filter for parents
      if (createdBy === "parent") {
        // Parent wants only their own templates
        whereCondition = {
          userId: req.parent.id,
          adminId: null,
        };
      } else if (createdBy === "admin") {
        // Parent wants only admin-created templates
        whereCondition = {
          adminId: { [Op.ne]: null },
          userId: null,
        };
      } else {
        // Default for parents: get templates created by this parent OR by any admin
        whereCondition = {
          [Op.or]: [
            {
              userId: req.parent.id,
              adminId: null, // Templates created by this parent
            },
            {
              adminId: { [Op.ne]: null },
              userId: null, // Templates created by any admin (default templates)
            },
          ],
        };
      }
    } else if (req.userType === "admin") {
      // Handle createdBy filter for admins
      if (createdBy === "parent") {
        return next(
          new ErrorHandler(
            "Admins cannot access parent-created templates using createdBy filter",
            403
          )
        );
      }

      // For admins: only show admin-created templates
      if (userId) {
        return next(
          new ErrorHandler(
            "Admins cannot filter by userId. Use adminId instead",
            403
          )
        );
      }

      if (adminId) {
        // Validate that adminId exists and is not the same as requesting admin
        if (adminId === req.admin.id) {
          // Get templates from requesting admin
          whereCondition = {
            adminId: req.admin.id,
            userId: null,
          };
        } else {
          return next(
            new ErrorHandler("Admins can only access their own templates", 403)
          );
        }
      } else if (createdBy === "admin" || !createdBy) {
        // Get templates created by the requesting admin only
        whereCondition = {
          adminId: req.admin.id,
          userId: null,
        };
      } else {
        return next(
          new ErrorHandler("Invalid filter combination for admin user", 400)
        );
      }
    } else {
      return next(new ErrorHandler("Invalid user type", 400));
    }

    // Add search filter - Updated to only search title since description is removed
    if (search && search.trim()) {
      const searchTerm = search.trim();

      // Validate search term length
      if (searchTerm.length < 2) {
        return next(
          new ErrorHandler(
            "Search term must be at least 2 characters long",
            400
          )
        );
      }

      if (searchTerm.length > 100) {
        return next(
          new ErrorHandler("Search term cannot exceed 100 characters", 400)
        );
      }

      whereCondition = {
        ...whereCondition,
        [Op.and]: [
          whereCondition,
          {
            title: { [Op.iLike]: `%${searchTerm}%` },
          },
        ],
      };
    }

    // Validate sort parameters
    const validSortFields = ["createdAt", "updatedAt", "title"];
    const validSortOrders = ["ASC", "DESC"];
    const finalSortBy = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const finalSortOrder = validSortOrders.includes(sortOrder.toUpperCase())
      ? sortOrder.toUpperCase()
      : "DESC";

    // Execute query with pagination
    const { count, rows: taskTemplates } =
      await models.TaskTemplate.findAndCountAll({
        where: whereCondition,
        order: [[finalSortBy, finalSortOrder]],
        limit: limitNum,
        offset: offset,
        attributes: [
          "id",
          "title",
          "image",
          "userId",
          "adminId",
          "createdAt",
          "updatedAt",
        ],
        include: [
          {
            model: models.Parent,
            attributes: ["id", "email"],
            required: false,
          },
          {
            model: models.Admin,
            attributes: ["id", "email"],
            required: false,
          },
        ],
      });

    // Calculate pagination metadata
    const totalPages = Math.ceil(count / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    // Add createdBy field for better understanding
    const templatesWithCreator = taskTemplates.map((template) => {
      const templateData = template.toJSON();
      templateData.createdBy = templateData.userId ? "parent" : "admin";
      templateData.creatorName = templateData.userId
        ? `${templateData.Parent?.firstName || ""} ${
            templateData.Parent?.lastName || ""
          }`.trim() || templateData.Parent?.email
        : `${templateData.Admin?.firstName || ""} ${
            templateData.Admin?.lastName || ""
          }`.trim() || templateData.Admin?.email;
      return templateData;
    });

    return res.status(200).json({
      success: true,
      message: "Task templates fetched successfully",
      data: templatesWithCreator,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: count,
        itemsPerPage: limitNum,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? pageNum + 1 : null,
        prevPage: hasPrevPage ? pageNum - 1 : null,
      },
      filters: {
        search: search || null,
        createdBy: createdBy || null,
        sortBy: finalSortBy,
        sortOrder: finalSortOrder,
        userId: userId || null,
        adminId: adminId || null,
      },
    });
  } catch (error) {
    console.error("Error fetching task templates:", error);
    return next(
      new ErrorHandler(error.message || "Failed to fetch task templates", 500)
    );
  }
});

//-------------------- Get tasks by task template ID-----------------------------------------
const getTasksByTemplateId = asyncHandler(async (req, res, next) => {
  try {
    // Determine user type and ID
    const userType = req.parent?.obj
      ? "parent"
      : req.child?.obj
      ? "child"
      : null;
    const userId = req.parent?.obj?.id || req.child?.obj?.id;
    const { taskTemplateId } = req.params;
    const {
      status,
      dueDateFrom,
      dueDateTo,
      childId,
      page = 1,
      limit = 10,
      historyFilter = "TILL_TODAY",
    } = req.query;

    // Validate user authentication
    if (!userType || !userId) {
      return next(new ErrorHandler("Invalid authentication token", 401));
    }

    // Validate taskTemplateId
    if (!isValidUUID(taskTemplateId)) {
      return next(
        new ErrorHandler("Invalid taskTemplateId. Must be a valid UUID", 400)
      );
    }

    // Validate query parameters using existing helper
    const {
      errors,
      page: validatedPage,
      limit: validatedLimit,
    } = validateQueryParams(req.query);
    if (errors.length > 0) {
      return next(
        new ErrorHandler(`Validation errors: ${errors.join(", ")}`, 400)
      );
    }

    // Validate historyFilter
    const validHistoryFilters = ["TILL_TODAY", "UPCOMING"];
    if (!validHistoryFilters.includes(historyFilter)) {
      return next(
        new ErrorHandler(
          "Invalid historyFilter. Must be 'TILL_TODAY' or 'UPCOMING'",
          400
        )
      );
    }

    // Validate task template existence and access
    const taskTemplate = await models.TaskTemplate.findByPk(taskTemplateId, {
      attributes: ["id", "title", "image", "userId", "adminId"],
    });

    if (!taskTemplate) {
      return next(new ErrorHandler("Task template not found", 404));
    }

    // Authorization checks
    if (userType === "parent") {
      // Parent can only access their own or admin-created templates
      if (!taskTemplate.userId && !taskTemplate.adminId) {
        return next(new ErrorHandler("Task template not accessible", 403));
      }
      if (taskTemplate.userId && taskTemplate.userId !== userId) {
        return next(
          new ErrorHandler("Not authorized to access this task template", 403)
        );
      }
    } else if (userType === "child") {
      // Child can only access templates associated with their tasks
      const childTask = await models.Task.findOne({
        where: { taskTemplateId, childId: userId },
      });
      if (!childTask) {
        return next(
          new ErrorHandler("Not authorized to access this task template", 403)
        );
      }
    }

    // Build where condition for tasks
    const where = { taskTemplateId };
    const taskInclude = [
      {
        model: models.TaskTemplate,
        attributes: ["id", "title", "image"],
      },
      {
        model: models.Child,
        attributes: ["id", "name"],
        required: true,
      },
    ];

    // Apply filters - Removed difficulty filter since it's not in the model anymore
    if (status && status !== "ALL") {
      where.status = status;
    }

    // Handle date filters based on historyFilter
    const today = moment().tz("Asia/Kolkata").startOf("day");
    if (historyFilter === "TILL_TODAY") {
      where.dueDate = { [Op.lte]: today.toDate() };
    } else if (historyFilter === "UPCOMING") {
      where.dueDate = { [Op.gt]: today.toDate() };
    }

    // Apply additional date range filters if provided
    if (dueDateFrom || dueDateTo) {
      where.dueDate = where.dueDate || {};
      if (dueDateFrom) where.dueDate[Op.gte] = new Date(dueDateFrom);
      if (dueDateTo) where.dueDate[Op.lte] = new Date(dueDateTo);
    }

    // Role-based access control
    if (userType === "parent") {
      // Verify parent has access to the child (if childId is provided)
      if (childId) {
        if (!isValidUUID(childId)) {
          return next(
            new ErrorHandler("Invalid childId. Must be a valid UUID", 400)
          );
        }
        const child = await models.Child.findOne({
          where: { id: childId, parentId: userId },
        });
        if (!child) {
          return next(
            new ErrorHandler("Child not found or not authorized", 403)
          );
        }
        where.childId = childId;
      } else {
        // Get all children of the parent
        const children = await models.Child.findAll({
          where: { parentId: userId },
          attributes: ["id"],
        });
        const childIds = children.map((child) => child.id);
        where.childId = { [Op.in]: childIds.length > 0 ? childIds : [null] };
      }
    } else if (userType === "child") {
      // Children can only see their own tasks
      where.childId = userId;
      if (childId && childId !== userId) {
        return next(
          new ErrorHandler("Unauthorized to view tasks for other children", 403)
        );
      }
    }

    // Fetch tasks with pagination
    const offset = (validatedPage - 1) * validatedLimit;
    const { count, rows: tasks } = await models.Task.findAndCountAll({
      where,
      include: taskInclude,
      offset,
      limit: validatedLimit,
      order: [["dueDate", historyFilter === "UPCOMING" ? "ASC" : "DESC"]],
    });

    // Format response to match the UI - Removed difficulty and duration fields
    const formattedTasks = tasks.map((task) => ({
      id: task.id,
      dueDate: moment(task.dueDate).tz("Asia/Kolkata").format("DD MMM YYYY"),
      dueTime: task.dueTime,
      status: task.status,
      taskTemplateId: task.taskTemplateId,
      description: task.description,
      rewardCoins: task.rewardCoins,
      recurrence: task.recurrence,
      childId: task.childId,
      childName: task.Child?.name,
      ...(userType === "parent" && {
        completedAt: task.completedAt,
        approvedAt: task.approvedAt,
        rejectedAt: task.rejectedAt,
        rejectionReason: task.rejectionReason,
      }),
    }));

    return res.status(200).json({
      success: true,
      message: "Tasks fetched successfully",
      data: {
        taskTemplate: {
          id: taskTemplate.id,
          title: taskTemplate.title,
          image: taskTemplate.image,
        },
        tasks: formattedTasks,
        pagination: {
          total: count,
          page: validatedPage,
          limit: validatedLimit,
          totalPages: Math.ceil(count / validatedLimit),
        },
        appliedFilters: {
          status: status || "ALL",
          dueDateFrom: dueDateFrom || null,
          dueDateTo: dueDateTo || null,
          childId: childId || (userType === "parent" ? "ALL_CHILDREN" : userId),
          historyFilter,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching tasks by template ID:", error);
    return next(
      new ErrorHandler(error.message || "Failed to fetch tasks", 500)
    );
  }
});

//---------------- Create a new task (Parent only)-----------------------------
const createTask = asyncHandler(async (req, res, next) => {
  const {
    taskTemplateId,
    childId,
    dueTime, // Format: HH:MM
    recurrence,
    recurrenceDates, // Array of dates in DD-MM-YYYY format
    description, // Now part of individual task instead of template
  } = req.body;
  const parentId = req.parent.id;

  try {
    // Validate task template
    const taskTemplate = await models.TaskTemplate.findByPk(taskTemplateId);
    if (!taskTemplate) {
      return next(new ErrorHandler("Task template not found", 404));
    }

    // Validate child
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

    // Validate recurrence
    const allowedRecurrences = ["ONCE", "DAILY", "WEEKLY", "MONTHLY"];
    if (!allowedRecurrences.includes(recurrence)) {
      return next(
        new ErrorHandler(
          "Invalid recurrence. Allowed: ONCE, DAILY, WEEKLY, MONTHLY",
          400
        )
      );
    }

    // Validate dueTime
    if (dueTime && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(dueTime)) {
      return next(
        new ErrorHandler(
          "Invalid dueTime format. Expected HH:MM (24-hour)",
          400
        )
      );
    }

    // Validate description if provided
    if (description && typeof description !== "string") {
      return next(new ErrorHandler("Description must be a string", 400));
    }
    if (description && description.trim().length > 1000) {
      return next(
        new ErrorHandler("Description cannot exceed 1000 characters", 400)
      );
    }

    // Hardcoded reward coins
    const finalReward = 10;

    // Handle recurrenceDates
    let validDates = [];
    if (!recurrenceDates || !Array.isArray(recurrenceDates)) {
      return next(
        new ErrorHandler("recurrenceDates must be a non-empty array", 400)
      );
    }

    // Remove duplicates and validate date format
    const uniqueDates = [...new Set(recurrenceDates)];
    const today = moment().tz("Asia/Kolkata").startOf("day");

    // Validate number of dates based on recurrence type
    if (recurrence === "ONCE" || recurrence === "DAILY") {
      if (uniqueDates.length !== 1) {
        return next(
          new ErrorHandler(
            `${recurrence} recurrence requires exactly one date`,
            400
          )
        );
      }
    } else if (recurrence === "WEEKLY") {
      if (uniqueDates.length > 7) {
        return next(
          new ErrorHandler(
            "WEEKLY recurrence cannot have more than 7 dates",
            400
          )
        );
      }
    } else if (recurrence === "MONTHLY") {
      // Get the month from the first date to validate number of days
      if (uniqueDates.length === 0) {
        return next(
          new ErrorHandler(
            "MONTHLY recurrence requires at least one date to determine the month",
            400
          )
        );
      }
      const firstDate = moment.tz(uniqueDates[0], "DD-MM-YYYY", "Asia/Kolkata");
      if (!firstDate.isValid()) {
        return next(
          new ErrorHandler(`Invalid date format: ${uniqueDates[0]}`, 400)
        );
      }
      const daysInMonth = firstDate.daysInMonth();
      if (uniqueDates.length > daysInMonth) {
        return next(
          new ErrorHandler(
            `MONTHLY recurrence cannot have more than ${daysInMonth} dates for the specified month`,
            400
          )
        );
      }
    }

    for (const date of uniqueDates) {
      if (!/^\d{2}-\d{2}-\d{4}$/.test(date)) {
        return next(
          new ErrorHandler(
            `Invalid date format: ${date}. Expected DD-MM-YYYY`,
            400
          )
        );
      }
      const parsedDate = moment.tz(date, "DD-MM-YYYY", "Asia/Kolkata");
      if (!parsedDate.isValid()) {
        return next(new ErrorHandler(`Invalid date: ${date}`, 400));
      }

      // For MONTHLY, ensure all dates are in the same month
      if (recurrence === "MONTHLY") {
        const firstDate = moment.tz(
          uniqueDates[0],
          "DD-MM-YYYY",
          "Asia/Kolkata"
        );
        if (!parsedDate.isSame(firstDate, "month")) {
          return next(
            new ErrorHandler(
              `All MONTHLY recurrence dates must be in the same month as ${uniqueDates[0]}`,
              400
            )
          );
        }
      }
      validDates.push(date);
    }

    // Sort dates
    validDates = sortRecurrenceDates(validDates);

    const isRecurring = recurrence !== "ONCE";
    const createdTasks = [];

    const t = await sequelize.transaction();
    try {
      // Create task instances for each valid date
      for (const date of validDates) {
        const dueDateTime = moment
          .tz(
            `${date} ${dueTime || "00:00"}:00`,
            "DD-MM-YYYY HH:mm:ss",
            "Asia/Kolkata"
          )
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
        const taskDate = moment.tz(date, "DD-MM-YYYY", "Asia/Kolkata");

        let status;
        if (taskDate.isBefore(today, "day")) {
          // Past date - set as PENDING (overdue)
          status = "PENDING";
        } else if (taskDate.isSame(today, "day")) {
          // Today's date - set as PENDING
          status = "PENDING";
        } else {
          // Future date - set as UPCOMING
          status = "UPCOMING";
        }

        // Alternative: If you want to prevent past dates entirely, add this validation:
        // if (taskDate.isBefore(today, "day")) {
        //   return next(
        //     new ErrorHandler(
        //       `Cannot create task for past date: ${date}. Please use current or future dates only.`,
        //       400
        //     )
        //   );
        // }

        // Create task - Removed duration and difficulty fields
        const task = await models.Task.create(
          {
            taskTemplateId,
            parentId,
            childId,
            dueDate: dueDateTime,
            dueTime: dueTime || "00:00",
            description: description?.trim() || null,
            recurrence,
            rewardCoins: finalReward,
            isRecurring,
            status,
          },
          { transaction: t }
        );

        // Create notification
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

        createdTasks.push({
          id: task.id,
          dueDate: task.dueDate,
          dueTime: task.dueTime,
          status: task.status,
          description: task.description,
        });
      }

      await t.commit();

      if (createdTasks.length === 0) {
        return next(
          new ErrorHandler(
            "No new tasks created due to duplicates or invalid dates",
            400
          )
        );
      }

      return res.status(201).json({
        success: true,
        message: "Tasks created successfully",
        data: {
          taskTemplateId,
          title: taskTemplate.title,
          image: taskTemplate.image,
          tasks: createdTasks,
        },
      });
    } catch (error) {
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error creating task:", error);
    return next(
      new ErrorHandler(error.message || "Failed to create task", 500)
    );
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
    const { status, dueDateFrom, dueDateTo, childId } = req.query;

    // Validate query parameters
    const {
      errors,
      page: validatedPage,
      limit: validatedLimit,
    } = validateQueryParams(req.query);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors,
      });
    }

    const where = {};
    const taskInclude = [
      {
        model: models.TaskTemplate,
        attributes: ["id", "title", "image"],
      },
    ];

    // Apply filters - Modified status handling
    if (status && status !== "ALL") {
      where.status = status;
    }
    // If status is 'ALL' or not provided, don't filter by status

    if (dueDateFrom || dueDateTo) {
      where.dueDate = {};
      if (dueDateFrom) where.dueDate[Op.gte] = new Date(dueDateFrom);
      if (dueDateTo) where.dueDate[Op.lte] = new Date(dueDateTo);
    }

    // Role-based logic
    if (userType === "parent") {
      // Verify parent has access to the child (if childId is provided)
      if (childId) {
        const child = await models.Child.findOne({
          where: { id: childId, parentId: userId },
        });
        if (!child) {
          return res.status(403).json({
            success: false,
            message: "Child not found or not authorized",
          });
        }
        where.childId = childId;
      } else {
        // Get all children of the parent
        const children = await models.Child.findAll({
          where: { parentId: userId },
          attributes: ["id"],
        });
        const childIds = children.map((child) => child.id);
        where.childId = { [Op.in]: childIds.length > 0 ? childIds : [null] }; // Handle no children
      }
    } else if (userType === "child") {
      // Children can only see their own tasks
      where.childId = userId;
      if (childId && childId !== userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized to view tasks for other children",
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: "Invalid user role",
      });
    }

    // Fetch tasks with pagination
    const offset = (validatedPage - 1) * validatedLimit;
    const { count, rows: tasks } = await models.Task.findAndCountAll({
      where,
      include: taskInclude,
      offset,
      limit: validatedLimit,
      order: [["dueDate", "ASC"]],
    });

    // Format response to match task creation API
    const formattedTasks = tasks.map((task) => ({
      id: task.id,
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      status: task.status,
      taskTemplateId: task.taskTemplateId,
      title: task.TaskTemplate?.title,
      image: task.TaskTemplate?.image,
      description: task.description, // Now from Task model
      rewardCoins: task.rewardCoins,
      recurrence: task.recurrence,
      // Include additional fields for parents only
      ...(userType === "parent" && {
        childId: task.childId,
        completedAt: task.completedAt,
        approvedAt: task.approvedAt,
        rejectedAt: task.rejectedAt,
        rejectionReason: task.rejectionReason,
      }),
    }));

    const response = {
      success: true,
      message: "Tasks retrieved successfully",
      data: {
        tasks: formattedTasks,
        pagination: {
          total: count,
          page: validatedPage,
          limit: validatedLimit,
          totalPages: Math.ceil(count / validatedLimit),
        },
        // Add filter summary for better understanding
        appliedFilters: {
          status: status || "ALL",
          dueDateFrom: dueDateFrom || null,
          dueDateTo: dueDateTo || null,
          childId: childId || (userType === "parent" ? "ALL_CHILDREN" : userId),
        },
      },
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error listing tasks:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

//---------------- Get specific task with template details (Parent and Child)-----------------------------
const getTaskTemplateWithRecurringDates = asyncHandler(async (req, res, next) => {
  try {
    const { taskTemplateId, childId } = req.params;

    // Get user type and ID from auth middleware
    const userType = req.userType;
    const userId = req.parent?.id || req.admin?.id || req.child?.id;

    console.log("userType:", userType, "userId:", userId, "taskTemplateId:", taskTemplateId, "childId:", childId);

    // Validate user authentication
    if (!userType || !userId) {
      return next(new ErrorHandler("Invalid authentication token", 401));
    }

    // Validate taskTemplateId and childId
    if (!isValidUUID(taskTemplateId)) {
      return next(
        new ErrorHandler("Invalid taskTemplateId. Must be a valid UUID", 400)
      );
    }

    if (!isValidUUID(childId)) {
      return next(
        new ErrorHandler("Invalid childId. Must be a valid UUID", 400)
      );
    }

    // Fetch task template with creator details
    const taskTemplate = await models.TaskTemplate.findByPk(taskTemplateId, {
      include: [
        {
          model: models.Parent,
          attributes: ["id", "email"],
          required: false,
        },
        {
          model: models.Admin,
          attributes: ["id", "email"],
          required: false,
        },
      ],
    });

    if (!taskTemplate) {
      return next(new ErrorHandler("Task template not found", 404));
    }

    // Verify child exists and get child details
    const child = await models.Child.findByPk(childId, {
      include: [
        {
          model: models.Parent,
          as: "parent",
          attributes: ["id", "email"],
          required: false,
        },
      ],
    });

    if (!child) {
      return next(new ErrorHandler("Child not found", 404));
    }

    // Authorization checks based on user type
    if (userType === "parent") {
      // Parent can access:
      // 1. Templates created by themselves (userId matches)
      // 2. Templates created by admin (adminId exists, userId is null)
      // 3. Child must belong to the parent
      const isOwnTemplate = taskTemplate.userId === userId;
      const isAdminTemplate = taskTemplate.adminId && !taskTemplate.userId;
      const isOwnChild = child.parentId === userId;

      if (!isOwnChild) {
        return next(
          new ErrorHandler("Not authorized to access this child's data", 403)
        );
      }

      if (!isOwnTemplate && !isAdminTemplate) {
        return next(
          new ErrorHandler("Not authorized to access this task template", 403)
        );
      }
    } else if (userType === "child") {
      // Child can only access their own data
      if (childId !== userId) {
        return next(
          new ErrorHandler("Not authorized to access this child's data", 403)
        );
      }
    } else if (userType === "admin") {
      // Admin can access all templates and children
      // No additional restrictions needed
    }

    // Fetch all tasks for this child and task template to get recurring dates
    const recurringTasks = await models.Task.findAll({
      where: {
        childId: childId,
        taskTemplateId: taskTemplateId,
      },
      attributes: [
        "id",
        "dueDate",
        "dueTime",
        "description",
        "status",
        "recurrence",
        "isRecurring",
        "rewardCoins",
        "createdAt",
        "updatedAt",
        "completedAt",
        "approvedAt",
        "rejectedAt",
      ],
      order: [["dueDate", "ASC"]],
    });

    // Format template data
    const templateData = {
      id: taskTemplate.id,
      title: taskTemplate.title,
      image: taskTemplate.image,
      createdAt: taskTemplate.createdAt,
      updatedAt: taskTemplate.updatedAt,
      createdBy: taskTemplate.userId ? "parent" : "admin",
      creator: taskTemplate.userId
        ? {
            id: taskTemplate.Parent?.id,
            email: taskTemplate.Parent?.email,
            type: "parent",
          }
        : {
            id: taskTemplate.Admin?.id,
            email: taskTemplate.Admin?.email,
            type: "admin",
          },
    };

    // Format child data
    const childData = {
      id: child.id,
      name: child.name,
      parentId: child.parentId,
      parent: child.parent
        ? {
            id: child.parent.id,
            email: child.parent.email,
          }
        : null,
    };

    // Format recurring tasks data
    const recurringDatesData = recurringTasks.map(task => ({
      taskId: task.id,
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      description: task.description,
      status: task.status,
      recurrence: task.recurrence,
      isRecurring: task.isRecurring,
      rewardCoins: task.rewardCoins,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
      approvedAt: task.approvedAt,
      rejectedAt: task.rejectedAt,
    }));

    // Get the most recent task's dueTime (or first one if available)
    const selectedDueTime = recurringTasks.length > 0 ? recurringTasks[0].dueTime : null;
    const selectedDescription = recurringTasks.length > 0 ? recurringTasks[0].description : null;

    return res.status(200).json({
      success: true,
      message: "Task template with recurring dates fetched successfully",
      data: {
        template: templateData,
        child: childData,
        selectedDueTime: selectedDueTime,
        selectedDescription: selectedDescription,
        recurringDates: recurringDatesData,
        totalRecurringTasks: recurringTasks.length,
      },
    });
  } catch (error) {
    console.error("Error fetching task template with recurring dates:", error);
    return next(
      new ErrorHandler(error.message || "Failed to fetch task template details", 500)
    );
  }
});
// -----------------update task and task template------------------------------------
const updateTaskTemplateAndTasks = asyncHandler(async (req, res, next) => {
  // Parse form-data
  const {
    name,
    recurringDates,
    childId,
    dueTime,
    recurrence,
    status,
    description, // Now for Task model instead of TaskTemplate
  } = req.body;
  const userType = req.userType;
  const userId = req.parent?.id || req.admin?.id;
  const taskTemplateId = req.params.taskTemplateId;

  // Parse JSON fields if they come as strings (common in form-data)
  const parsedRecurringDates = recurringDates
    ? typeof recurringDates === "string"
      ? JSON.parse(recurringDates)
      : recurringDates
    : [];

  if (!userType || !userId) {
    return next(new ErrorHandler("Invalid authentication token", 401));
  }

  // Validate task update fields if any are provided
  const taskUpdates = {};
  if (dueTime) {
    if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(dueTime)) {
      return next(
        new ErrorHandler(
          "Invalid dueTime format. Expected HH:MM (24-hour)",
          400
        )
      );
    }
    taskUpdates.dueTime = dueTime;
  }

  if (recurrence) {
    const allowedRecurrences = ["ONCE", "DAILY", "WEEKLY", "MONTHLY"];
    if (!allowedRecurrences.includes(recurrence)) {
      return next(
        new ErrorHandler(
          "Invalid recurrence. Allowed: ONCE, DAILY, WEEKLY, MONTHLY",
          400
        )
      );
    }
    taskUpdates.recurrence = recurrence;
    taskUpdates.isRecurring = recurrence !== "ONCE";
  }
  if (status) {
    if (status !== "UPCOMING") {
      return next(new ErrorHandler("Can only update to UPCOMING status", 400));
    }
    taskUpdates.status = status;
  }

  // Hardcoded reward coins - always set to 10
  taskUpdates.rewardCoins = 10;

  // Add description to task updates if provided
  if (description !== undefined) {
    taskUpdates.description = description || null;
  }

  // If task updates are provided, childId is required
  if (Object.keys(taskUpdates).length > 0 && !childId) {
    return next(
      new ErrorHandler("childId is required when updating task fields", 400)
    );
  }

  // If recurringDates is provided, childId is required
  if (parsedRecurringDates.length > 0 && !childId) {
    return next(
      new ErrorHandler("childId is required when providing recurringDates", 400)
    );
  }

  const t = await models.db.sequelize.transaction();

  try {
    // Fetch task template with creator information
    const taskTemplate = await models.TaskTemplate.findByPk(taskTemplateId, {
      include: [
        { model: models.Parent, attributes: ["id"], required: false },
        { model: models.Admin, attributes: ["id"], required: false },
      ],
      transaction: t,
    });
    console.log("taskTemplate:", taskTemplate);

    if (!taskTemplate) {
      await t.rollback();
      return next(new ErrorHandler("Task template not found", 404));
    }

    // Updated Authorization checks
    if (userType === "parent") {
      // Parents can access both their own templates AND admin-created templates
      // But they can only MODIFY their own templates
      const isParentTemplate =
        taskTemplate.userId && taskTemplate.userId === userId;
      const isAdminTemplate =
        taskTemplate.adminId && taskTemplate.adminId !== null;

      // Parents can access the template if it's theirs or created by admin
      if (!isParentTemplate && !isAdminTemplate) {
        await t.rollback();
        return next(
          new ErrorHandler("Template not found or not accessible", 404)
        );
      }

      // Check if parent is trying to modify template details (name, image)
      const isModifyingTemplate = name || req.file;
      if (isModifyingTemplate && !isParentTemplate) {
        await t.rollback();
        return next(
          new ErrorHandler("Parents cannot modify admin-created templates", 403)
        );
      }
    } else if (userType === "admin") {
      // Admins can only modify their own templates
      if (taskTemplate.userId && taskTemplate.userId !== null) {
        await t.rollback();
        return next(
          new ErrorHandler("Admins cannot modify parent-created templates", 403)
        );
      }
      if (taskTemplate.adminId !== userId) {
        await t.rollback();
        return next(
          new ErrorHandler("Not authorized to modify this template", 403)
        );
      }
    } else {
      await t.rollback();
      return next(new ErrorHandler("Invalid user type", 403));
    }

    // Validate and update TaskTemplate (only if user has permission to modify)
    const templateUpdates = {};
    const canModifyTemplate =
      (userType === "parent" && taskTemplate.userId === userId) ||
      (userType === "admin" && taskTemplate.adminId === userId);

    if (canModifyTemplate) {
      if (name) {
        const trimmedName = name.trim();
        if (
          !trimmedName ||
          /^\d+$/.test(trimmedName) ||
          /^[^a-zA-Z0-9]+$/.test(trimmedName)
        ) {
          await t.rollback();
          return next(
            new ErrorHandler(
              "Invalid name. Must contain letters and not be empty or special characters only",
              400
            )
          );
        }
        templateUpdates.title = trimmedName;
      }

      // Handle image upload
      if (req.file) {
        try {
          const uploadResult = await uploadFile(req.file);
          templateUpdates.image = {
            url: uploadResult.url,
            filename: uploadResult.filename,
            originalName: uploadResult.originalName,
            size: uploadResult.size,
            mimetype: uploadResult.mimetype,
          };

          // Delete old image if it exists
          if (taskTemplate.image && taskTemplate.image.filename) {
            await deleteFile(taskTemplate.image.filename);
          }
        } catch (uploadError) {
          await t.rollback();
          console.error("Image upload error:", uploadError);
          return next(new ErrorHandler("Failed to upload image", 500));
        }
      }

      // Update TaskTemplate if there are changes
      if (Object.keys(templateUpdates).length > 0) {
        await taskTemplate.update(templateUpdates, { transaction: t });
      }
    }

    // Validate child
    if (childId) {
      if (!isValidUUID(childId)) {
        await t.rollback();
        return next(
          new ErrorHandler("Invalid childId. Must be a valid UUID", 400)
        );
      }
      const child = await models.Child.findOne({
        where: {
          id: childId,
          parentId: userType === "parent" ? userId : { [Op.ne]: null },
        },
        transaction: t,
      });
      if (!child) {
        await t.rollback();
        return next(
          new ErrorHandler(
            "Child not found or not associated with this parent",
            404
          )
        );
      }
    }

    // Process recurringDates
    let validDates = [];
    if (parsedRecurringDates.length > 0) {
      const uniqueDates = [...new Set(parsedRecurringDates)];
      for (const date of uniqueDates) {
        if (!/^\d{2}-\d{2}-\d{4}$/.test(date)) {
          await t.rollback();
          return next(
            new ErrorHandler(
              `Invalid date format: ${date}. Expected DD-MM-YYYY`,
              400
            )
          );
        }
        const parsedDate = moment.tz(date, "DD-MM-YYYY", "Asia/Kolkata");
        if (!parsedDate.isValid()) {
          await t.rollback();
          return next(new ErrorHandler(`Invalid date: ${date}`, 400));
        }
        validDates.push(date);
      }
      validDates = sortRecurrenceDates(validDates);
    }

    // FIXED: Fetch ALL existing tasks for the template/child, not just UPCOMING ones
    const allExistingTasks = await models.Task.findAll({
      where: {
        taskTemplateId,
        ...(childId && { childId }),
      },
      transaction: t,
    });

    // Separate tasks by status
    const upcomingTasks = allExistingTasks.filter(
      (task) => task.status === "UPCOMING"
    );
    const nonUpcomingTasks = allExistingTasks.filter(
      (task) => task.status !== "UPCOMING"
    );

    // Get dates that already have non-upcoming tasks (these should be skipped)
    const nonUpcomingTaskDates = nonUpcomingTasks.map((task) =>
      moment(task.dueDate).tz("Asia/Kolkata").format("DD-MM-YYYY")
    );

    // Update or create tasks for recurringDates
    if (validDates.length > 0 && childId) {
      for (const date of validDates) {
        // FIXED: Skip if this date already has a task with non-upcoming status
        if (nonUpcomingTaskDates.includes(date)) {
          console.log(
            `Skipping date ${date} - already has task with status other than UPCOMING`
          );
          continue;
        }

        const dueDateTime = moment
          .tz(
            `${date} ${taskUpdates.dueTime || "00:00"}:00`,
            "DD-MM-YYYY HH:mm:ss",
            "Asia/Kolkata"
          )
          .toDate();

        // Find existing UPCOMING task for this date
        const existingUpcomingTask = upcomingTasks.find(
          (t) =>
            moment(t.dueDate).tz("Asia/Kolkata").format("DD-MM-YYYY") === date
        );

        if (existingUpcomingTask) {
          // Update existing UPCOMING task
          if (Object.keys(taskUpdates).length > 0) {
            await existingUpcomingTask.update(taskUpdates, { transaction: t });
          }
        } else {
          // Create new task only if no task exists for this date
          await models.Task.create(
            {
              id: uuidv4(),
              taskTemplateId,
              parentId: userType === "parent" ? userId : null,
              childId,
              dueDate: dueDateTime,
              dueTime: taskUpdates.dueTime || "00:00",
              description: taskUpdates.description || null,
              recurrence: taskUpdates.recurrence || "ONCE",
              rewardCoins: 10, // Hardcoded reward coins
              isRecurring: taskUpdates.isRecurring || false,
              status: "UPCOMING",
            },
            { transaction: t }
          );
        }
      }
    }

    // FIXED: Delete only UPCOMING tasks that are not in validDates and don't have non-upcoming status
    for (const task of upcomingTasks) {
      const taskDate = moment(task.dueDate)
        .tz("Asia/Kolkata")
        .format("DD-MM-YYYY");
      if (!validDates.includes(taskDate)) {
        await task.destroy({ transaction: t });
      }
    }

    await t.commit();

    // Fetch updated template for response
    const updatedTemplate = await models.TaskTemplate.findByPk(taskTemplateId, {
      attributes: ["id", "title", "image"],
      include: [
        {
          model: models.Task,
          attributes: [
            "id",
            "dueDate",
            "dueTime",
            "status",
            "rewardCoins",
            "recurrence",
            "description",
          ],
          where: { ...(childId && { childId }) },
        },
      ],
    });

    return res.status(200).json({
      success: true,
      message: "Task template and tasks updated successfully",
      data: {
        taskTemplate: {
          id: updatedTemplate.id,
          title: updatedTemplate.title,
          image: updatedTemplate.image,
          tasks: updatedTemplate.Tasks.map((task) => ({
            id: task.id,
            dueDate: moment(task.dueDate)
              .tz("Asia/Kolkata")
              .format("DD-MM-YYYY"),
            dueTime: task.dueTime,
            status: task.status,
            rewardCoins: task.rewardCoins,
            recurrence: task.recurrence,
            description: task.description,
          })),
        },
      },
    });
  } catch (error) {
    await t.rollback();
    console.error("Error updating task template and tasks:", error);
    return next(
      new ErrorHandler(
        error.message || "Failed to update task template and tasks",
        500
      )
    );
  }
});

//----------------Mark task as completed (Child only)-------------------------
const updateTaskStatus = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;
  const { status, reason } = req.body;
  // console.log(req.parent);
  console.log(req.child);

  const userType = req.parent?.obj?.id
    ? "parent"
    : req.child?.obj?.id
    ? "child"
    : null;
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
          attributes: ["id", "title", "image"],
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

    // Store template and child data before any updates
    const taskTemplateTitle = task.TaskTemplate?.title;
    const childName = task.Child?.name;

    const t = await sequelize.transaction();
    try {
      // Mark related notifications as read for the current user
      await models.Notification.update(
        { isRead: true },
        {
          where: {
            relatedItemType: "task",
            relatedItemId: taskId,
            recipientType: userType,
            recipientId: userId,
            isRead: false,
          },
          transaction: t,
        }
      );

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

        // Award coins
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
                message:
                  "Congratulations! You earned a 50-coin bonus for a 7-day streak!",
                recipientType: "child",
                recipientId: task.childId,
                relatedItemType: "task",
                relatedItemId: task.id,
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
                description: task.description, // Keep existing description if any
                recurrence: task.recurrence,
                rewardCoins: task.rewardCoins,
                isRecurring: true,
                status: "PENDING",
              },
              { transaction: t }
            );
          }
        }

        // Notify child
        await models.Notification.create(
          {
            type: "task_approval",
            message: `Your task "${taskTemplateTitle}" was approved! You earned ${task.rewardCoins} coins.`,
            recipientType: "child",
            recipientId: task.childId,
            relatedItemType: "task",
            relatedItemId: task.id,
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

        // Notify child
        await models.Notification.create(
          {
            type: "task_rejection",
            message: `Your task "${taskTemplateTitle}" was rejected.${
              reason ? ` Reason: ${reason}` : ""
            }`,
            recipientType: "child",
            recipientId: task.childId,
            relatedItemType: "task",
            relatedItemId: task.id,
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
          description: task.description, // From Task model
          image: task.TaskTemplate?.image,
          rewardCoins: task.rewardCoins,
          status: status, // Use the new status instead of task.status
          dueDate: task.dueDate,
          dueTime: task.dueTime,
          recurrence: task.recurrence,
          isRecurring: task.isRecurring,
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

//----------------Update task reward coins (Parent only)---------------------------------------
const updateTaskReward = asyncHandler(async (req, res, next) => {
  const { rewardCoins } = req.body;

  try {
    // Validate reward coins
    if (rewardCoins === undefined || rewardCoins === null) {
      return next(new ErrorHandler("Reward coins is required", 400));
    }

    if (typeof rewardCoins !== "number" || rewardCoins < 0) {
      return next(
        new ErrorHandler("Reward coins must be a non-negative number", 400)
      );
    }

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
        "description",
        "recurrence",
        "isRecurring",
      ],
    });

    if (!task) {
      return next(new ErrorHandler("Task not found", 404));
    }

    if (task.status === "COMPLETED" || task.status === "APPROVED") {
      return next(
        new ErrorHandler(
          "Cannot update reward coins for a completed or approved task",
          400
        )
      );
    }

    await task.update({ rewardCoins });

    // Notify child of reward update
    const taskTemplate = await models.TaskTemplate.findByPk(
      task.taskTemplateId
    );

    if (taskTemplate) {
      await models.Notification.create({
        type: "reward_update",
        message: `Reward for task "${taskTemplate.title}" updated to ${rewardCoins} coins.`,
        recipientType: "child",
        recipientId: task.childId,
        relatedItemType: "task",
        relatedItemId: task.id,
      });
    }

    return res.status(200).json({
      success: true, // Fixed typo from "succes"
      message: "Task reward coins updated successfully",
      data: task,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

//------------------Stop task (Parent only)-------------------
const deleteTasksByTemplate = asyncHandler(async (req, res, next) => {
  const { childId, templateId } = req.params;
  const parentId = req.parent.id;

  try {
    // Validate required parameters
    if (!childId || !templateId) {
      return next(
        new ErrorHandler("Child ID and Template ID are required", 400)
      );
    }

    // Validate task template exists
    const taskTemplate = await models.TaskTemplate.findByPk(templateId);
    if (!taskTemplate) {
      return next(new ErrorHandler("Task template not found", 404));
    }

    // Validate child belongs to parent
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

    const t = await sequelize.transaction();

    try {
      // Find all tasks for the given child and template
      const tasks = await models.Task.findAll({
        where: {
          childId: childId,
          taskTemplateId: templateId,
        },
        include: [
          {
            model: models.TaskTemplate,
            attributes: ["title"],
          },
        ],
        transaction: t,
      });

      if (tasks.length === 0) {
        await t.rollback();
        return next(
          new ErrorHandler(
            "No tasks found for the given child and template",
            404
          )
        );
      }

      // Separate tasks by status and recurrence
      const upcomingTasks = tasks.filter((task) => task.status === "UPCOMING");
      const dailyRecurringTasks = tasks.filter(
        (task) =>
          task.isRecurring === true &&
          task.recurrence === "DAILY" &&
          task.status !== "UPCOMING"
      );

      let deletedCount = 0;
      let stoppedRecurringCount = 0;

      // Delete all UPCOMING tasks
      if (upcomingTasks.length > 0) {
        const upcomingTaskIds = upcomingTasks.map((task) => task.id);

        // Delete related notifications first (if any)
        await models.Notification.destroy({
          where: {
            relatedItemType: "task",
            relatedItemId: {
              [Op.in]: upcomingTaskIds,
            },
          },
          transaction: t,
        });

        // Delete upcoming tasks
        const deleteResult = await models.Task.destroy({
          where: {
            id: {
              [Op.in]: upcomingTaskIds,
            },
          },
          transaction: t,
        });

        deletedCount = deleteResult;
      }

      // Stop daily recurring tasks by setting isRecurring to false
      if (dailyRecurringTasks.length > 0) {
        const recurringTaskIds = dailyRecurringTasks.map((task) => task.id);

        const [updateCount] = await models.Task.update(
          {
            isRecurring: false,
          },
          {
            where: {
              id: {
                [Op.in]: recurringTaskIds,
              },
            },
            transaction: t,
          }
        );

        stoppedRecurringCount = updateCount;

        // Create notification for stopped recurring tasks
        await models.Notification.create(
          {
            type: "task_update",
            message: `Daily recurring task "${tasks[0].TaskTemplate.title}" has been stopped and will no longer create new instances.`,
            recipientType: "child",
            recipientId: childId,
            relatedItemType: "task",
            relatedItemId: dailyRecurringTasks[0].id,
          },
          { transaction: t }
        );
      }

      await t.commit();

      // Return success response with details
      return res.status(200).json({
        success: true,
        message: "Tasks processed successfully",
        data: {
          taskTemplateId: templateId,
          title: tasks[0]?.TaskTemplate?.title || "Unknown Template",
          totalTasksFound: tasks.length,
          upcomingTasksDeleted: deletedCount,
          dailyRecurringTasksStopped: stoppedRecurringCount,
          details: {
            deletedUpcomingTasks: upcomingTasks.length,
            stoppedRecurringTasks: dailyRecurringTasks.length,
          },
        },
      });
    } catch (error) {
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error in deleteTasksByTemplate:", error);
    return next(
      new ErrorHandler(error.message || "Failed to delete tasks", 500)
    );
  }
});

//---------------Delete a task (Parent only)--------------------------
const deleteTask = asyncHandler(async (req, res, next) => {
  try {
    const task = await models.Task.findOne({
      where: { id: req.params.taskId, parentId: req.parent?.id },
      include: [
        {
          model: models.TaskTemplate,
          attributes: ["title"],
        },
      ],
    });

    if (!task) {
      return next(
        new ErrorHandler(
          "Task not found or not associated with this parent",
          404
        )
      );
    }

    if (task.status === "COMPLETED" || task.status === "APPROVED") {
      return next(
        new ErrorHandler("Cannot delete a completed or approved task", 400)
      );
    }

    const taskTitle = task.TaskTemplate?.title || "Unknown Task";

    // Use transaction for consistency
    const t = await sequelize.transaction();

    try {
      // Delete related notifications first
      await models.Notification.destroy({
        where: {
          relatedItemType: "task",
          relatedItemId: task.id,
        },
        transaction: t,
      });

      // Notify child of task deletion
      await models.Notification.create(
        {
          type: "task_deletion",
          message: `Task "${taskTitle}" has been deleted by your parent.`,
          recipientType: "child",
          recipientId: task.childId,
          relatedItemType: "task",
          relatedItemId: task.id,
        },
        { transaction: t }
      );

      // Delete the task
      await task.destroy({ transaction: t });

      await t.commit();

      return res.status(200).json({
        success: true,
        message: "Task deleted successfully",
      });
    } catch (error) {
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error in deleteTask:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});

//------------------analytics chores---------------------------------
const getTaskTemplateAnalytics = asyncHandler(async (req, res, next) => {
  const { taskTemplateId } = req.params;
  const { timeline = 'days', startDate, endDate } = req.query; // timeline: 'days', 'weeks', 'months'

  try {
    // Validate taskTemplateId
    if (!isValidUUID(taskTemplateId)) {
      return next(new ErrorHandler("Invalid taskTemplateId. Must be a valid UUID", 400));
    }

    // Validate timeline parameter
    const validTimelines = ['days', 'weeks', 'months'];
    if (!validTimelines.includes(timeline)) {
      return next(new ErrorHandler("Invalid timeline. Must be 'days', 'weeks', or 'months'", 400));
    }

    // Validate date range if provided
    let dateFilter = {};
    if (startDate || endDate) {
      const start = startDate ? moment(startDate) : null;
      const end = endDate ? moment(endDate) : null;

      if (start && !start.isValid()) {
        return next(new ErrorHandler("Invalid startDate format. Use YYYY-MM-DD", 400));
      }
      if (end && !end.isValid()) {
        return next(new ErrorHandler("Invalid endDate format. Use YYYY-MM-DD", 400));
      }
      if (start && end && start.isAfter(end)) {
        return next(new ErrorHandler("startDate cannot be after endDate", 400));
      }

      // Build date filter for completedAt
      if (start) dateFilter.completedAt = { ...dateFilter.completedAt, [Op.gte]: start.toDate() };
      if (end) dateFilter.completedAt = { ...dateFilter.completedAt, [Op.lte]: end.endOf('day').toDate() };
    }

    // Fetch the task template
    const taskTemplate = await models.TaskTemplate.findByPk(taskTemplateId);
    if (!taskTemplate) {
      return next(new ErrorHandler("Task template not found", 404));
    }

    // Build where clause for tasks
    const taskWhereClause = { 
      taskTemplateId,
      ...dateFilter 
    };

    // Fetch all tasks for the task template
    const tasks = await models.Task.findAll({
      where: taskWhereClause,
      include: [
        {
          model: models.Child,
          attributes: ["id", "age"],
          required: false, // LEFT JOIN to include tasks without children
        },
      ],
    });

    if (tasks.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No tasks found for this task template",
        // data: {
        //   completionRate: 0,
        //   averageCompletionTime: null,
        //   rejectionRate: 0,
        //   timeline: {
        //     type: timeline,
        //     data: [],
        //     summary: {
        //       totalPeriods: 0,
        //       mostActiveLabel: null,
        //       mostActiveCount: 0,
        //       leastActiveLabel: null,
        //       leastActiveCount: 0
        //     }
        //   },
        //   usageByAgeGroup: [],
        //   totalTasks: 0,
        //   completedTasks: 0,
        //   rejectedTasks: 0,
        //   pendingTasks: 0,
        //   approvedTasks: 0,
        //   overdueeTasks: 0
        // },
      });
    }

    // Initialize analytics variables
    let completedTasks = 0;
    let rejectedTasks = 0;
    let pendingTasks = 0;
    let approvedTasks = 0;
    let overdueTasks = 0;
    let totalCompletionTime = 0;
    let completionTimesCount = 0;
    const timelineCounts = new Map();
    const ageGroupCounts = new Map();

    // Process each task
    tasks.forEach((task) => {
      const { status, completedAt, createdAt, dueDate, Child } = task;

      // Count by status
      switch (status) {
        case "COMPLETED":
          completedTasks++;
          break;
        case "APPROVED":
          approvedTasks++;
          break;
        case "REJECTED":
          rejectedTasks++;
          break;
        case "PENDING":
          pendingTasks++;
          break;
        case "OVERDUE":
          overdueTasks++;
          break;
      }

      // Calculate completion metrics for completed and approved tasks
      if (status === "COMPLETED" || status === "APPROVED") {
        const completionDate = completedAt || createdAt;
        
        if (completionDate) {
          // Average completion time calculation
          if (dueDate) {
            const completionTime = moment(completionDate).diff(moment(dueDate), "minutes");
            totalCompletionTime += Math.abs(completionTime); // Use absolute value for meaningful average
            completionTimesCount++;
          }

          // Timeline analysis based on completion date
          const dateMoment = moment(completionDate);
          let timelineKey;
          let timelineLabel;

          switch (timeline) {
            case 'days':
              timelineKey = dateMoment.format('YYYY-MM-DD');
              timelineLabel = dateMoment.format('dddd, MMM DD');
              break;
            case 'weeks':
              const weekStart = dateMoment.clone().startOf('isoWeek');
              const weekEnd = dateMoment.clone().endOf('isoWeek');
              timelineKey = `${dateMoment.isoWeekYear()}-W${dateMoment.isoWeek()}`;
              timelineLabel = `Week ${dateMoment.isoWeek()}, ${dateMoment.isoWeekYear()} (${weekStart.format('MMM DD')} - ${weekEnd.format('MMM DD')})`;
              break;
            case 'months':
              timelineKey = dateMoment.format('YYYY-MM');
              timelineLabel = dateMoment.format('MMMM YYYY');
              break;
          }

          if (timelineKey && timelineLabel) {
            const current = timelineCounts.get(timelineKey) || { 
              key: timelineKey, 
              label: timelineLabel, 
              count: 0,
              date: dateMoment.toDate() // For sorting
            };
            current.count += 1;
            timelineCounts.set(timelineKey, current);
          }
        }
      }

      // Usage by age group analysis
      if (Child && Child.age !== null && Child.age !== undefined) {
        const age = parseInt(Child.age);
        if (!isNaN(age) && age >= 0) {
          const ageGroupStart = Math.floor(age / 5) * 5;
          const ageGroupEnd = ageGroupStart + 4;
          const ageGroupKey = `${ageGroupStart}-${ageGroupEnd}`;
          
          const current = ageGroupCounts.get(ageGroupKey) || {
            ageGroup: ageGroupKey,
            minAge: ageGroupStart,
            maxAge: ageGroupEnd,
            count: 0
          };
          current.count += 1;
          ageGroupCounts.set(ageGroupKey, current);
        }
      }
    });

    // Calculate analytics
    const totalTasks = tasks.length;
    const completionRate = totalTasks > 0 ? parseFloat(((completedTasks + approvedTasks) / totalTasks * 100).toFixed(2)) : 0;
    const rejectionRate = totalTasks > 0 ? parseFloat((rejectedTasks / totalTasks * 100).toFixed(2)) : 0;
    const averageCompletionTime = completionTimesCount > 0 ? parseFloat((totalCompletionTime / completionTimesCount).toFixed(2)) : null;

    // Process timeline data
    const timelineData = Array.from(timelineCounts.values())
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(item => ({
        key: item.key,
        label: item.label,
        count: item.count,
        percentage: totalTasks > 0 ? parseFloat((item.count / totalTasks * 100).toFixed(2)) : 0
      }));

    // Timeline summary
    const timelineSummary = {
      totalPeriods: timelineData.length,
      mostActiveLabel: null,
      mostActiveCount: 0,
      leastActiveLabel: null,
      leastActiveCount: 0
    };

    if (timelineData.length > 0) {
      const sortedByCount = [...timelineData].sort((a, b) => b.count - a.count);
      timelineSummary.mostActiveLabel = sortedByCount[0].label;
      timelineSummary.mostActiveCount = sortedByCount[0].count;
      timelineSummary.leastActiveLabel = sortedByCount[sortedByCount.length - 1].label;
      timelineSummary.leastActiveCount = sortedByCount[sortedByCount.length - 1].count;
    }

    // Process age group data
    const usageByAgeGroup = Array.from(ageGroupCounts.values())
      .sort((a, b) => a.minAge - b.minAge)
      .map(item => ({
        ageGroup: item.ageGroup,
        count: item.count,
        percentage: totalTasks > 0 ? parseFloat((item.count / totalTasks * 100).toFixed(2)) : 0
      }));

    // Return comprehensive analytics
    return res.status(200).json({
      success: true,
      message: "Task template analytics fetched successfully",
      data: {
        // Core metrics
        completionRate,
        averageCompletionTime,
        rejectionRate,
        
        // Timeline data with filtering
        timeline: {
          type: timeline,
          data: timelineData,
          summary: timelineSummary,
          dateRange: {
            startDate: startDate || null,
            endDate: endDate || null
          }
        },
        
        // Age group analysis
        usageByAgeGroup,
        
        // Task status breakdown
        taskBreakdown: {
          totalTasks,
          completedTasks,
          approvedTasks,
          rejectedTasks,
          pendingTasks,
          overdueTasks,
          statusDistribution: {
            completed: totalTasks > 0 ? parseFloat((completedTasks / totalTasks * 100).toFixed(2)) : 0,
            approved: totalTasks > 0 ? parseFloat((approvedTasks / totalTasks * 100).toFixed(2)) : 0,
            rejected: totalTasks > 0 ? parseFloat((rejectedTasks / totalTasks * 100).toFixed(2)) : 0,
            pending: totalTasks > 0 ? parseFloat((pendingTasks / totalTasks * 100).toFixed(2)) : 0,
            overdue: totalTasks > 0 ? parseFloat((overdueTasks / totalTasks * 100).toFixed(2)) : 0
          }
        },
        
        // Metadata
        taskTemplate: {
          id: taskTemplate.id,
          title: taskTemplate.title,
          image: taskTemplate.image
        },
        
        // Query parameters used
        filters: {
          timeline,
          startDate: startDate || null,
          endDate: endDate || null
        }
      },
    });
  } catch (error) {
    console.error("Error fetching task template analytics:", error);
    return next(new ErrorHandler(error.message || "Failed to fetch analytics", 500));
  }
});

module.exports = {
  createTaskTemplate,
  getAllTaskTemplate,
  createTask,
  listTasks,
  getTasksByTemplateId,
  updateTaskTemplateAndTasks,
  getTaskTemplateWithRecurringDates,
  updateTaskStatus,
  updateTaskReward,
  deleteTasksByTemplate,
  deleteTask,
  getTaskTemplateAnalytics,
};

// getChildTasks,
// getParentTasks,
/*
//---------------- Get specific template details (Parent and Admin)-----------------------------
// const getTaskTemplateDetails = asyncHandler(async (req, res, next) => {
//   try {
//     const { templateId } = req.params;
    
//     // Determine user type and ID
//     const userType = req.parent?.obj ? "parent" : req.admin?.obj ? "admin" : null;
//     const userId = req.parent?.obj?.id || req.admin?.obj?.id;

//     // Validate user authentication
//     if (!userType || !userId) {
//       return next(new ErrorHandler("Invalid authentication token", 401));
//     }

//     // Validate templateId
//     if (!isValidUUID(templateId)) {
//       return next(new ErrorHandler("Invalid templateId. Must be a valid UUID", 400));
//     }

//     // Fetch template with related data
//     const template = await models.TaskTemplate.findByPk(templateId, {
//       include: [
//         {
//           model: models.Parent,
//           attributes: ["id", "firstName", "lastName", "email"],
//           required: false,
//         },
//         {
//           model: models.Admin,
//           attributes: ["id", "firstName", "lastName", "email"],
//           required: false,
//         },
//       ],
//     });

//     if (!template) {
//       return next(new ErrorHandler("Task template not found", 404));
//     }

//     // Authorization checks based on user type
//     if (userType === "parent") {
//       // Parent can access:
//       // 1. Templates created by themselves (userId matches)
//       // 2. Templates created by admin (adminId exists, userId is null)
//       const isOwnTemplate = template.userId === userId;
//       const isAdminTemplate = template.adminId && !template.userId;
      
//       if (!isOwnTemplate && !isAdminTemplate) {
//         return next(new ErrorHandler("Not authorized to access this template", 403));
//       }
//     } else if (userType === "admin") {
//       // Admin can only access templates created by themselves
//       if (template.adminId !== userId) {
//         return next(new ErrorHandler("Not authorized to access this template", 403));
//       }
//     }

//     // Get task count for this template (based on user access)
//     let taskCountWhere = { taskTemplateId: templateId };
    
//     if (userType === "parent") {
//       // For parents, count tasks assigned to their children or created by them
//       const children = await models.Child.findAll({
//         where: { parentId: userId },
//         attributes: ["id"],
//       });
//       const childIds = children.map((child) => child.id);
      
//       taskCountWhere = {
//         taskTemplateId: templateId,
//         [Op.or]: [
//           { parentId: userId }, // Tasks created by this parent
//           { childId: { [Op.in]: childIds.length > 0 ? childIds : [null] } }, // Tasks assigned to their children
//         ],
//       };
//     } else if (userType === "admin") {
//       // For admin, this might be more complex based on your business logic
//       // For now, let's count all tasks using this template
//       taskCountWhere = { taskTemplateId: templateId };
//     }

//     const taskCount = await models.Task.count({
//       where: taskCountWhere,
//     });

//     // Get task status distribution
//     const taskStatusDistribution = await models.Task.findAll({
//       where: taskCountWhere,
//       attributes: [
//         "status",
//         [sequelize.fn("COUNT", sequelize.col("status")), "count"],
//       ],
//       group: ["status"],
//       raw: true,
//     });

//     // Format the response data
//     const templateData = {
//       id: template.id,
//       title: template.title,
//       description: template.description,
//       image: template.image,
//       createdAt: template.createdAt,
//       updatedAt: template.updatedAt,
//       createdBy: template.userId ? "parent" : "admin",
//       creator: template.userId 
//         ? {
//             id: template.Parent?.id,
//             name: `${template.Parent?.firstName || ""} ${template.Parent?.lastName || ""}`.trim(),
//             email: template.Parent?.email,
//             type: "parent",
//           }
//         : {
//             id: template.Admin?.id,
//             name: `${template.Admin?.firstName || ""} ${template.Admin?.lastName || ""}`.trim(),
//             email: template.Admin?.email,
//             type: "admin",
//           },
//       statistics: {
//         totalTasks: taskCount,
//         statusDistribution: taskStatusDistribution.reduce((acc, item) => {
//           acc[item.status] = parseInt(item.count);
//           return acc;
//         }, {}),
//       },
//     };

//     return res.status(200).json({
//       success: true,
//       message: "Template details fetched successfully",
//       data: {
//         template: templateData,
//       },
//     });
//   } catch (error) {
//     console.error("Error fetching template details:", error);
//     return next(
//       new ErrorHandler(error.message || "Failed to fetch template details", 500)
//     );
//   }
// });

// //---------------- Get template details with associated tasks (Parent only)-----------------------------
// const getTemplateWithTasks = asyncHandler(async (req, res, next) => {
//   try {
//     const { templateId } = req.params;
//     const {
//       status,
//       difficulty,
//       dueDateFrom,
//       dueDateTo,
//       childId,
//       page = 1,
//       limit = 10,
//       historyFilter = "ALL", // ALL, TILL_TODAY, UPCOMING
//     } = req.query;
    
//     // This endpoint is primarily for parents
//     const userType = req.parent?.obj ? "parent" : null;
//     const userId = req.parent?.obj?.id;

//     // Validate user authentication
//     if (!userType || !userId) {
//       return next(new ErrorHandler("Invalid authentication token", 401));
//     }

//     // Validate templateId
//     if (!isValidUUID(templateId)) {
//       return next(new ErrorHandler("Invalid templateId. Must be a valid UUID", 400));
//     }

//     // Validate query parameters
//     const {
//       errors,
//       page: validatedPage,
//       limit: validatedLimit,
//     } = validateQueryParams(req.query);
//     if (errors.length > 0) {
//       return next(
//         new ErrorHandler(`Validation errors: ${errors.join(", ")}`, 400)
//       );
//     }

//     // First, get and validate template access
//     const template = await models.TaskTemplate.findByPk(templateId, {
//       include: [
//         {
//           model: models.Parent,
//           attributes: ["id", "firstName", "lastName", "email"],
//           required: false,
//         },
//         {
//           model: models.Admin,
//           attributes: ["id", "firstName", "lastName", "email"],
//           required: false,
//         },
//       ],
//     });

//     if (!template) {
//       return next(new ErrorHandler("Task template not found", 404));
//     }

//     // Authorization check for template access
//     const isOwnTemplate = template.userId === userId;
//     const isAdminTemplate = template.adminId && !template.userId;
    
//     if (!isOwnTemplate && !isAdminTemplate) {
//       return next(new ErrorHandler("Not authorized to access this template", 403));
//     }

//     // Build where condition for tasks
//     const where = { taskTemplateId: templateId };

//     // Apply filters
//     if (status && status !== "ALL") {
//       where.status = status;
//     }
//     if (difficulty && difficulty !== "ALL") {
//       where.difficulty = difficulty;
//     }

//     // Handle date filters based on historyFilter
//     const today = moment().tz("Asia/Kolkata").startOf("day");
//     if (historyFilter === "TILL_TODAY") {
//       where.dueDate = { [Op.lte]: today.toDate() };
//     } else if (historyFilter === "UPCOMING") {
//       where.dueDate = { [Op.gt]: today.toDate() };
//     }

//     // Apply additional date range filters if provided
//     if (dueDateFrom || dueDateTo) {
//       where.dueDate = where.dueDate || {};
//       if (dueDateFrom) where.dueDate[Op.gte] = new Date(dueDateFrom);
//       if (dueDateTo) where.dueDate[Op.lte] = new Date(dueDateTo);
//     }

//     // Handle child filtering
//     if (childId) {
//       if (!isValidUUID(childId)) {
//         return next(new ErrorHandler("Invalid childId. Must be a valid UUID", 400));
//       }
//       // Verify parent has access to the child
//       const child = await models.Child.findOne({
//         where: { id: childId, parentId: userId },
//       });
//       if (!child) {
//         return next(new ErrorHandler("Child not found or not authorized", 403));
//       }
//       where.childId = childId;
//     } else {
//       // Get all children of the parent
//       const children = await models.Child.findAll({
//         where: { parentId: userId },
//         attributes: ["id"],
//       });
//       const childIds = children.map((child) => child.id);
//       where.childId = { [Op.in]: childIds.length > 0 ? childIds : [null] };
//     }

//     // Fetch tasks with pagination
//     const offset = (validatedPage - 1) * validatedLimit;
//     const { count, rows: tasks } = await models.Task.findAndCountAll({
//       where,
//       include: [
//         {
//           model: models.Child,
//           attributes: ["id", "name"],
//           required: true,
//         },
//       ],
//       offset,
//       limit: validatedLimit,
//       order: [["dueDate", historyFilter === "UPCOMING" ? "ASC" : "DESC"]],
//     });

//     // Format tasks
//     const formattedTasks = tasks.map((task) => ({
//       id: task.id,
//       dueDate: moment(task.dueDate).tz("Asia/Kolkata").format("DD MMM YYYY"),
//       dueTime: task.dueTime,
//       status: task.status,
//       difficulty: task.difficulty,
//       rewardCoins: task.rewardCoins,
//       recurrence: task.recurrence,
//       duration: task.duration,
//       childId: task.childId,
//       childName: task.Child?.name,
//       completedAt: task.completedAt,
//       approvedAt: task.approvedAt,
//       rejectedAt: task.rejectedAt,
//       rejectionReason: task.rejectionReason,
//     }));

//     // Format template data
//     const templateData = {
//       id: template.id,
//       title: template.title,
//       description: template.description,
//       image: template.image,
//       createdAt: template.createdAt,
//       updatedAt: template.updatedAt,
//       createdBy: template.userId ? "parent" : "admin",
//       creator: template.userId 
//         ? {
//             id: template.Parent?.id,
//             name: `${template.Parent?.firstName || ""} ${template.Parent?.lastName || ""}`.trim(),
//             email: template.Parent?.email,
//             type: "parent",
//           }
//         : {
//             id: template.Admin?.id,
//             name: `${template.Admin?.firstName || ""} ${template.Admin?.lastName || ""}`.trim(),
//             email: template.Admin?.email,
//             type: "admin",
//           },
//     };

//     return res.status(200).json({
//       success: true,
//       message: "Template with tasks fetched successfully",
//       data: {
//         template: templateData,
//         tasks: formattedTasks,
//         pagination: {
//           total: count,
//           page: validatedPage,
//           limit: validatedLimit,
//           totalPages: Math.ceil(count / validatedLimit),
//         },
//         appliedFilters: {
//           status: status || "ALL",
//           difficulty: difficulty || "ALL",
//           dueDateFrom: dueDateFrom || null,
//           dueDateTo: dueDateTo || null,
//           childId: childId || "ALL_CHILDREN",
//           historyFilter,
//         },
//       },
//     });
//   } catch (error) {
//     console.error("Error fetching template with tasks:", error);
//     return next(
//       new ErrorHandler(error.message || "Failed to fetch template with tasks", 500)
//     );
//   }
// });

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
