const models = require("../Modals/index");
const { Op, literal } = require("sequelize");
const db = require("../Configs/db/DbConfig");
const sequelize = db.sequelize;
const moment = require("moment");
const { v4: uuidv4, validate: isValidUUID } = require("uuid");
const { uploadFile, deleteFile } = require("../Utils/cdnImplementation");
const ErrorHandler = require("../Utils/errorHandle");
const asyncHandler = require("../Utils/asyncHandler");
const { buildAuthConditions, formatGoalData } = require("../Utils/goalHelper");

//---------------------Create a new goal (Parent only)------------------------------------
const createGoal = asyncHandler(async (req, res, next) => {
  let {
    title,
    description,
    type, // "TASK" or "COIN"
    childId,
    productIds = [], // Array of product IDs for rewards
    taskIds = [], // Array of task IDs for TASK type goals
    isGift = false, // If true, productId can be null
  } = req.body;
  const parentId = req.parent.id;

  try {
    // Parse arrays from form data strings if needed
    if (typeof productIds === "string") {
      productIds = productIds
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id);
    }
    if (typeof taskIds === "string") {
      taskIds = taskIds
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id);
    }

    // Parse boolean from string if needed
    if (typeof isGift === "string") {
      isGift = isGift.toLowerCase() === "true";
    }

    // Validate required fields
    if (!title || !title.trim()) {
      return next(new ErrorHandler("Title is required", 400));
    }

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2 || trimmedTitle.length > 100) {
      return next(
        new ErrorHandler("Title must be between 2 and 100 characters", 400)
      );
    }

    // Validate type
    const validTypes = ["TASK", "COIN"];
    if (!type || !validTypes.includes(type)) {
      return next(
        new ErrorHandler("Type is required and must be 'TASK' or 'COIN'", 400)
      );
    }

    // Validate child
    if (!childId || !isValidUUID(childId)) {
      return next(new ErrorHandler("Valid childId is required", 400));
    }

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

    // Validate description length if provided
    if (description && typeof description !== "string") {
      return next(new ErrorHandler("Description must be a string", 400));
    }
    if (description && description.trim().length > 2000) {
      return next(
        new ErrorHandler("Description cannot exceed 2000 characters", 400)
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

    // Validate products if provided and not a gift
    let validProductIds = [];
    if (!isGift && productIds && productIds.length > 0) {
      // Validate product IDs format
      const invalidProductIds = productIds.filter((id) => !isValidUUID(id));
      if (invalidProductIds.length > 0) {
        return next(
          new ErrorHandler(
            `Invalid product IDs: ${invalidProductIds.join(", ")}`,
            400
          )
        );
      }

      // Check if products exist
      const existingProducts = await models.Product.findAll({
        where: { id: { [Op.in]: productIds } },
        attributes: ["id"],
      });

      if (existingProducts.length !== productIds.length) {
        const foundIds = existingProducts.map((p) => p.id);
        const notFound = productIds.filter((id) => !foundIds.includes(id));
        return next(
          new ErrorHandler(`Products not found: ${notFound.join(", ")}`, 404)
        );
      }
      validProductIds = productIds;
    } else if (isGift && (!productIds || productIds.length === 0)) {
      // For gifts, products are optional
      validProductIds = [];
    } else if (!isGift && (!productIds || productIds.length === 0)) {
      return next(
        new ErrorHandler("Products are required for non-gift goals", 400)
      );
    }

    // Validate tasks for TASK type goals
    let validTaskIds = [];
    if (type === "TASK") {
      if (!taskIds || taskIds.length === 0) {
        return next(
          new ErrorHandler("Tasks are required for TASK type goals", 400)
        );
      }

      // Validate task IDs format
      const invalidTaskIds = taskIds.filter((id) => !isValidUUID(id));
      if (invalidTaskIds.length > 0) {
        return next(
          new ErrorHandler(
            `Invalid task IDs: ${invalidTaskIds.join(", ")}`,
            400
          )
        );
      }

      // Check if tasks exist and are valid (UPCOMING, PENDING, or OVERDUE)
      const existingTasks = await models.Task.findAll({
        where: {
          id: { [Op.in]: taskIds },
          childId: childId,
          status: { [Op.in]: ["UPCOMING", "PENDING", "OVERDUE"] },
        },
        attributes: ["id", "status"],
      });

      if (existingTasks.length !== taskIds.length) {
        const foundIds = existingTasks.map((t) => t.id);
        const notFound = taskIds.filter((id) => !foundIds.includes(id));

        // Check if tasks exist but have wrong status
        const allTasks = await models.Task.findAll({
          where: {
            id: { [Op.in]: notFound },
            childId: childId,
          },
          attributes: ["id", "status"],
        });

        const wrongStatus = allTasks.filter(
          (t) => !["UPCOMING", "PENDING", "OVERDUE"].includes(t.status)
        );

        if (wrongStatus.length > 0) {
          return next(
            new ErrorHandler(
              `Tasks with invalid status (must be UPCOMING, PENDING, or OVERDUE): ${wrongStatus
                .map((t) => `${t.id} (${t.status})`)
                .join(", ")}`,
              400
            )
          );
        }

        const actuallyNotFound = notFound.filter(
          (id) => !allTasks.some((t) => t.id === id)
        );

        if (actuallyNotFound.length > 0) {
          return next(
            new ErrorHandler(
              `Tasks not found or not associated with this child: ${actuallyNotFound.join(
                ", "
              )}`,
              404
            )
          );
        }
      }
      validTaskIds = taskIds;
    } else if (type === "COIN" && taskIds && taskIds.length > 0) {
      return next(
        new ErrorHandler("Tasks cannot be assigned to COIN type goals", 400)
      );
    }

    const t = await sequelize.transaction();
    try {
      // Create goal
      const goalData = {
        title: trimmedTitle,
        description: description?.trim() || null,
        image: imageData,
        type,
        childId,
        parentId,
        status: "PENDING", // Default status
      };

      const goal = await models.Goal.create(goalData, { transaction: t });

      // Associate products if any
      if (validProductIds.length > 0) {
        await goal.setProducts(validProductIds, { transaction: t });
      }

      // Associate tasks if any
      if (validTaskIds.length > 0) {
        await goal.setTasks(validTaskIds, { transaction: t });
      }

      // Create notification for child
      await models.Notification.create(
        {
          relatedItemId: goal.id,
          relatedItemType: "goal",
          recipientId: childId,
          recipientType: "child",
          message: `New goal "${trimmedTitle}" has been set for you!`,
          type: "goal_assigned",
        },
        { transaction: t }
      );

      await t.commit();

      return res.status(201).json({
        success: true,
        message: "Goal created successfully",
        data: {
          id: goal.id,
          title: goal.title,
          description: goal.description,
          image: goal.image,
          type: goal.type,
          status: goal.status,
          childId: goal.childId,
          parentId: parentId,
          isGift,
          productsCount: validProductIds.length,
          tasksCount: validTaskIds.length,
          createdAt: goal.createdAt,
        },
      });
    } catch (error) {
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error creating goal:", error);
    return next(
      new ErrorHandler(error.message || "Failed to create goal", 500)
    );
  }
});

//--------------------Get all goals with filtering and pagination---------------------------------------------------------
const getAllGoals = asyncHandler(async (req, res, next) => {
  try {
    // Extract and validate query parameters
    const {
      page = 1,
      limit = 10,
      search,
      type,
      status,
      sortBy = "createdAt",
      sortOrder = "DESC",
      childId,
    } = req.query;
    console.log("hii i am in function");

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(Math.max(1, parseInt(limit)), 100);
    const offset = (pageNum - 1) * limitNum;

    // Validate filters
    const validTypes = ["TASK", "COIN", "ALL"];
    const validStatuses = [
      "PENDING",
      "COMPLETED",
      "APPROVED",
      "REJECTED",
      "ALL",
    ];
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "title",
      "type",
      "status",
    ];
    const validSortOrders = ["ASC", "DESC"];

    if (type && !validTypes.includes(type)) {
      return next(
        new ErrorHandler(
          "Invalid type filter. Must be 'TASK', 'COIN', or 'ALL'",
          400
        )
      );
    }

    if (status && !validStatuses.includes(status)) {
      return next(
        new ErrorHandler(
          `Invalid status filter. Must be one of: ${validStatuses.join(", ")}`,
          400
        )
      );
    }

    // Build authorization conditions
    let whereCondition;
    try {
      whereCondition = await buildAuthConditions(req, childId);
    } catch (error) {
      return next(error);
    }

    // Add filters
    if (type && type !== "ALL") {
      whereCondition.type = type;
    }

    if (status && status !== "ALL") {
      whereCondition.status = status;
    }

    // Add search filter
    if (search?.trim()) {
      const searchTerm = search.trim();
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

      whereCondition[Op.or] = [
        { title: { [Op.iLike]: `%${searchTerm}%` } },
        { description: { [Op.iLike]: `%${searchTerm}%` } },
      ];
    }

    // Validate and set sorting
    const finalSortBy = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const finalSortOrder = validSortOrders.includes(sortOrder.toUpperCase())
      ? sortOrder.toUpperCase()
      : "DESC";

    // Execute optimized query
    const { count, rows: goals } = await models.Goal.findAndCountAll({
      where: whereCondition,
      order: [[finalSortBy, finalSortOrder]],
      limit: limitNum,
      offset: offset,
      include: [
        {
          model: models.Child,
          as: "child",
          attributes: ["id", "name"],
          required: true,
        },
        {
          model: models.Product,
          as: "products",
          attributes: ["id", "name"],
          through: { attributes: [] },
          required: false,
          include: [
            {
              model: models.ProductVariant,
              as: "variants",
              attributes: ["id", "price", "compare_at_price"],
              where: { is_active: true },
              required: false,
            },
          ],
        },
        {
          model: models.Task,
          as: "tasks",
          attributes: ["id", "dueDate", "status", "description"], // Removed "title" from here
          include: [
            {
              model: models.TaskTemplate,
              attributes: ["id", "title"], // Title is accessed from TaskTemplate
              required: false,
            },
          ],
          through: { attributes: [] },
          required: false,
        },
      ],
    });

    // Calculate total tasks across all goals for usage percentage
    const totalTasksAcrossAllGoals = goals.reduce((sum, goal) => {
      return sum + (goal.tasks ? goal.tasks.length : 0);
    }, 0);

    // Add usage percentage and completion rate to each goal
    const goalsWithStats = goals.map((goal) => {
      // Calculate usage and completion stats
      const tasks = goal.tasks || [];
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(
        (task) => task.status === "COMPLETED" || task.status === "APPROVED"
      ).length;

      // Usage percentage: this goal's tasks relative to all goals' tasks
      const usagePercentage =
        totalTasksAcrossAllGoals > 0
          ? Math.round((totalTasks / totalTasksAcrossAllGoals) * 100)
          : 0;

      // Completion rate: percentage of completed tasks in this goal
      const completionRate =
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      // Add the stats to goal's dataValues so they're included in toJSON()
      goal.dataValues.usagePercentage = usagePercentage;
      goal.dataValues.completionRate = completionRate;

      return goal;
    });
    // Calculate pagination metadata
    const totalPages = Math.ceil(count / limitNum);
    const pagination = {
      currentPage: pageNum,
      totalPages,
      totalItems: count,
      itemsPerPage: limitNum,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
      nextPage: pageNum < totalPages ? pageNum + 1 : null,
      prevPage: pageNum > 1 ? pageNum - 1 : null,
    };

    // Format response
    const formattedGoals = goalsWithStats.map((goal) => formatGoalData(goal));

    return res.status(200).json({
      success: true,
      message: "Goals fetched successfully",
      data: formattedGoals,
      pagination,
      filters: {
        search: search || null,
        type: type || null,
        status: status || null,
        sortBy: finalSortBy,
        sortOrder: finalSortOrder,
        childId: childId || null,
      },
    });
  } catch (error) {
    console.error("Error fetching goals:", error);
    return next(
      new ErrorHandler(error.message || "Failed to fetch goals", 500)
    );
  }
});

//--------------------Get goal by ID with enhanced details------------------------
const getGoalById = asyncHandler(async (req, res, next) => {
  try {
    const { goalId } = req.params;

    if (!isValidUUID(goalId)) {
      return next(
        new ErrorHandler("Invalid goalId. Must be a valid UUID", 400)
      );
    }

    // Build authorization conditions
    let whereCondition;
    try {
      whereCondition = await buildAuthConditions(req);
      whereCondition.id = goalId;
    } catch (error) {
      return next(error);
    }

    const goal = await models.Goal.findOne({
      where: whereCondition,
      include: [
        {
          model: models.Child,
          as: "child",
          attributes: ["id", "name"],
          required: true,
        },
        {
          model: models.Product,
          as: "products",
          attributes: ["id", "name", "description", "images", "type"],
          through: { attributes: [] },
          required: false,
          include: [
            {
              model: models.ProductVariant,
              as: "variants",
              attributes: [
                "id",
                "price",
                "compare_at_price",
                "attributes",
                "is_active",
              ],
              required: false,
            },
          ],
        },
        {
          model: models.Task,
          as: "tasks",
          attributes: ["id", "dueDate", "status", "description"],
          include: [
            {
              model: models.TaskTemplate,
              attributes: ["id", "title"],
              required: false,
            },
          ],
          through: { attributes: [] },
          required: false,
        },
      ],
    });

    if (!goal) {
      return next(new ErrorHandler("Goal not found or not authorized", 404));
    }

    const formattedGoal = formatGoalData(goal, true);

    return res.status(200).json({
      success: true,
      message: "Goal fetched successfully",
      data: formattedGoal,
    });
  } catch (error) {
    console.error("Error fetching goal by ID:", error);
    return next(new ErrorHandler(error.message || "Failed to fetch goal", 500));
  }
});

//--------------------Update goal---------------------------------------------------------
const updateGoal = asyncHandler(async (req, res, next) => {
  try {
    const { goalId } = req.params;
    const {
      title,
      description,
      type,
      status,
      productIds,
      taskIds,
      isGift = false,
      rejectionReason,
    } = req.body;

    // Validate goalId
    if (!isValidUUID(goalId)) {
      return next(
        new ErrorHandler("Invalid goalId. Must be a valid UUID", 400)
      );
    }

    // Find goal and verify access
    const goal = await models.Goal.findOne({
      where: { id: goalId },
      include: [
        {
          model: models.Child,
          as: "child",
          attributes: ["id", "name", "parentId"],
          required: true,
        },
      ],
    });

    if (!goal) {
      return next(new ErrorHandler("Goal not found", 404));
    }

    // Check if user is parent or child
    const isParent = req.parent && goal.child.parentId === req.parent.id;
    const isChild = req.child && goal.childId === req.child.id;

    if (!isParent && !isChild) {
      return next(new ErrorHandler("Not authorized to update this goal", 403));
    }

    // Status validation logic
    if (status !== undefined) {
      const validStatuses = ["PENDING", "COMPLETED", "APPROVED", "REJECTED"];
      if (!validStatuses.includes(status)) {
        return next(
          new ErrorHandler(
            "Invalid status. Must be one of: " + validStatuses.join(", "),
            400
          )
        );
      }

      const currentStatus = goal.status;

      // Status transition validation
      switch (currentStatus) {
        case "PENDING":
          // From PENDING: Child can only update to COMPLETED, Parent can update to APPROVED/REJECTED
          if (isChild && status !== "COMPLETED") {
            return next(
              new ErrorHandler(
                "Child can only update pending goals to completed",
                403
              )
            );
          }
          if (isParent && !["APPROVED", "REJECTED"].includes(status)) {
            return next(
              new ErrorHandler(
                "Parent can only approve or reject pending goals",
                403
              )
            );
          }
          break;

        case "OVERDUE":
          // From OVERDUE: Child can only update to COMPLETED, Parent can update to APPROVED/REJECTED
          if (isChild && status !== "COMPLETED") {
            return next(
              new ErrorHandler(
                "Child can only update overdue goals to completed",
                403
              )
            );
          }
          if (isParent && !["APPROVED", "REJECTED"].includes(status)) {
            return next(
              new ErrorHandler(
                "Parent can only approve or reject overdue goals",
                403
              )
            );
          }
          break;

        case "COMPLETED":
          // From COMPLETED: Only parent can update to APPROVED/REJECTED
          if (isChild) {
            return next(
              new ErrorHandler("Child cannot update completed goals", 403)
            );
          }
          if (isParent && !["APPROVED", "REJECTED"].includes(status)) {
            return next(
              new ErrorHandler(
                "Completed goals can only be approved or rejected",
                400
              )
            );
          }
          break;

        case "APPROVED":
        case "REJECTED":
          // Final states - cannot be changed
          return next(
            new ErrorHandler(
              "Approved or rejected goals cannot be updated",
              400
            )
          );

        default:
          return next(new ErrorHandler("Invalid current goal status", 400));
      }

      // Validate rejection reason when status is REJECTED
      if (
        status === "REJECTED" &&
        (!rejectionReason || !rejectionReason.trim())
      ) {
        return next(
          new ErrorHandler(
            "Rejection reason is required when rejecting a goal",
            400
          )
        );
      }
    }

    // Only parents can update non-status fields
    if (
      !isParent &&
      (title !== undefined ||
        description !== undefined ||
        type !== undefined ||
        productIds !== undefined ||
        taskIds !== undefined ||
        req.file)
    ) {
      return next(
        new ErrorHandler("Only parents can update goal details", 403)
      );
    }

    // Validate title if provided
    if (title !== undefined) {
      if (!title || !title.trim()) {
        return next(new ErrorHandler("Title cannot be empty", 400));
      }
      const trimmedTitle = title.trim();
      if (trimmedTitle.length < 2 || trimmedTitle.length > 100) {
        return next(
          new ErrorHandler("Title must be between 2 and 100 characters", 400)
        );
      }
    }

    // Validate type if provided
    if (type !== undefined) {
      const validTypes = ["TASK", "COIN"];
      if (!validTypes.includes(type)) {
        return next(new ErrorHandler("Type must be 'TASK' or 'COIN'", 400));
      }
    }

    // Validate description if provided
    if (description !== undefined && description !== null) {
      if (typeof description !== "string") {
        return next(new ErrorHandler("Description must be a string", 400));
      }
      if (description.trim().length > 2000) {
        return next(
          new ErrorHandler("Description cannot exceed 2000 characters", 400)
        );
      }
    }

    // Handle image upload if file is provided
    let imageData = goal.image; // Keep existing image by default
    if (req.file) {
      try {
        // Delete old image if exists
        if (goal.image && goal.image.filename) {
          try {
            await deleteFile(goal.image.filename);
          } catch (deleteError) {
            console.warn("Failed to delete old image:", deleteError.message);
          }
        }

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

    const t = await sequelize.transaction();
    try {
      // Prepare update data
      const updateData = {};
      if (title !== undefined) updateData.title = title.trim();
      if (description !== undefined)
        updateData.description = description?.trim() || null;
      if (type !== undefined) updateData.type = type;
      if (status !== undefined) {
        updateData.status = status;
        if (status === "COMPLETED") {
          updateData.completedAt = new Date();
        } else if (status === "APPROVED") {
          updateData.approvedAt = new Date();
        } else if (status === "REJECTED") {
          updateData.rejectedAt = new Date();
          updateData.rejectionReason = rejectionReason?.trim();
        }
      }
      if (imageData !== goal.image) updateData.image = imageData;

      // Update goal
      await goal.update(updateData, { transaction: t });

      // Handle product associations if provided (only for parents)
      if (productIds !== undefined && isParent) {
        if (!isGift && (!productIds || productIds.length === 0)) {
          await t.rollback();
          return next(
            new ErrorHandler("Products are required for non-gift goals", 400)
          );
        }

        if (productIds && productIds.length > 0) {
          // Validate product IDs
          const invalidProductIds = productIds.filter((id) => !isValidUUID(id));
          if (invalidProductIds.length > 0) {
            await t.rollback();
            return next(
              new ErrorHandler(
                `Invalid product IDs: ${invalidProductIds.join(", ")}`,
                400
              )
            );
          }

          // Check if products exist
          const existingProducts = await models.Product.findAll({
            where: { id: { [Op.in]: productIds } },
            attributes: ["id"],
            transaction: t,
          });

          if (existingProducts.length !== productIds.length) {
            const foundIds = existingProducts.map((p) => p.id);
            const notFound = productIds.filter((id) => !foundIds.includes(id));
            await t.rollback();
            return next(
              new ErrorHandler(
                `Products not found: ${notFound.join(", ")}`,
                404
              )
            );
          }

          await goal.setProducts(productIds, { transaction: t });
        } else {
          // Remove all product associations
          await goal.setProducts([], { transaction: t });
        }
      }

      // Handle task associations if provided (only for parents)
      if (taskIds !== undefined && isParent) {
        const finalType = type !== undefined ? type : goal.type;

        if (finalType === "TASK") {
          if (!taskIds || taskIds.length === 0) {
            await t.rollback();
            return next(
              new ErrorHandler("Tasks are required for TASK type goals", 400)
            );
          }

          // Validate task IDs
          const invalidTaskIds = taskIds.filter((id) => !isValidUUID(id));
          if (invalidTaskIds.length > 0) {
            await t.rollback();
            return next(
              new ErrorHandler(
                `Invalid task IDs: ${invalidTaskIds.join(", ")}`,
                400
              )
            );
          }

          // Check if tasks exist and are valid
          const existingTasks = await models.Task.findAll({
            where: {
              id: { [Op.in]: taskIds },
              childId: goal.childId,
              status: { [Op.in]: ["UPCOMING", "PENDING", "OVERDUE"] },
            },
            attributes: ["id", "status"],
            transaction: t,
          });

          if (existingTasks.length !== taskIds.length) {
            const foundIds = existingTasks.map((task) => task.id);
            const notFound = taskIds.filter((id) => !foundIds.includes(id));
            await t.rollback();
            return next(
              new ErrorHandler(
                `Tasks not found or have invalid status: ${notFound.join(
                  ", "
                )}`,
                404
              )
            );
          }

          await goal.setTasks(taskIds, { transaction: t });
        } else if (finalType === "COIN" && taskIds.length > 0) {
          await t.rollback();
          return next(
            new ErrorHandler("Tasks cannot be assigned to COIN type goals", 400)
          );
        } else {
          // Remove all task associations for COIN type
          await goal.setTasks([], { transaction: t });
        }
      }

      await t.commit();

      // Fetch updated goal with associations (including TaskTemplate for title)
      const updatedGoal = await models.Goal.findByPk(goalId, {
        include: [
          {
            model: models.Child,
            as: "child",
            attributes: ["id", "name"],
          },
          {
            model: models.Product,
            as: "products",
            attributes: ["id", "name"],
            through: { attributes: [] },
            required: false,
            include: [
              {
                model: models.ProductVariant,
                as: "variants",
                attributes: ["id", "price", "compare_at_price"],
                where: { is_active: true },
                required: false,
              },
            ],
          },
          {
            model: models.Task,
            as: "tasks",
            attributes: ["id", "dueDate", "status", "description"],
            include: [
              {
                model: models.TaskTemplate,
                attributes: ["id", "title"],
                required: false,
              },
            ],
            through: { attributes: [] },
            required: false,
          },
        ],
      });

      // Format the response data properly
      const formattedGoal = {
        id: updatedGoal.id,
        title: updatedGoal.title,
        description: updatedGoal.description,
        image: updatedGoal.image,
        type: updatedGoal.type,
        status: updatedGoal.status,
        childId: updatedGoal.childId,
        childName: updatedGoal.child?.name,
        products:
          updatedGoal.products?.map((product) => ({
            id: product.id,
            name: product.name,
            variants: product.variants || [],
          })) || [],
        tasks:
          updatedGoal.tasks?.map((task) => ({
            id: task.id,
            title: task.TaskTemplate?.title || null,
            dueDate: task.dueDate,
            status: task.status,
            description: task.description,
          })) || [],
        productsCount: updatedGoal.products?.length || 0,
        tasksCount: updatedGoal.tasks?.length || 0,
        completedAt: updatedGoal.completedAt,
        approvedAt: updatedGoal.approvedAt,
        rejectedAt: updatedGoal.rejectedAt,
        rejectionReason: updatedGoal.rejectionReason,
        updatedAt: updatedGoal.updatedAt,
      };

      return res.status(200).json({
        success: true,
        message: "Goal updated successfully",
        data: formattedGoal,
      });
    } catch (error) {
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error updating goal:", error);
    return next(
      new ErrorHandler(error.message || "Failed to update goal", 500)
    );
  }
});

//--------------------Delete goal---------------------------------------------------------
const deleteGoal = asyncHandler(async (req, res, next) => {
  try {
    const { goalId } = req.params;

    // Validate goalId
    if (!isValidUUID(goalId)) {
      return next(
        new ErrorHandler("Invalid goalId. Must be a valid UUID", 400)
      );
    }

    // Only parents can delete goals
    if (!req.parent) {
      return next(new ErrorHandler("Only parents can delete goals", 403));
    }

    // Find goal and verify access
    const goal = await models.Goal.findOne({
      where: { id: goalId },
      include: [
        {
          model: models.Child,
          as: "child",
          attributes: ["id", "name", "parentId"],
          required: true,
        },
        {
          model: models.Product,
          as: "products",
          attributes: ["id"],
          through: { attributes: [] },
          required: false,
        },
        {
          model: models.Task,
          as: "tasks",
          attributes: ["id"],
          through: { attributes: [] },
          required: false,
        },
      ],
    });

    if (!goal) {
      return next(new ErrorHandler("Goal not found", 404));
    }

    // Verify parent has access to this goal
    if (goal.child.parentId !== req.parent.id) {
      return next(new ErrorHandler("Not authorized to delete this goal", 403));
    }

    const t = await sequelize.transaction();
    try {
      // Remove all product associations (Many-to-Many)
      if (goal.products && goal.products.length > 0) {
        await goal.setProducts([], { transaction: t });
      }

      // Remove all task associations (Many-to-Many)
      if (goal.tasks && goal.tasks.length > 0) {
        await goal.setTasks([], { transaction: t });
      }

      // Delete image from CDN if exists
      if (goal.image && goal.image.filename) {
        try {
          await deleteFile(goal.image.filename);
        } catch (deleteError) {
          console.warn(
            "Failed to delete goal image from CDN:",
            deleteError.message
          );
          // Don't fail the entire operation if image deletion fails
        }
      }

      // Delete the goal
      await goal.destroy({ transaction: t });

      await t.commit();

      return res.status(200).json({
        success: true,
        message: "Goal deleted successfully",
        data: {
          deletedGoalId: goalId,
          deletedGoalTitle: goal.title,
        },
      });
    } catch (error) {
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error deleting goal:", error);
    return next(
      new ErrorHandler(error.message || "Failed to delete goal", 500)
    );
  }
});

//-----------------analytics of goals based on child-------------------------------------------
// const getGoalAnalytics = asyncHandler(async (req, res, next) => {
//   try {
//     const { childId } = req.query;
//     const { timeframe = 'all', startDate, endDate } = req.query;

//     // Only parents can access analytics
//     if (!req.parent) {
//       return next(new ErrorHandler("Only parents can access goal analytics", 403));
//     }

//     // Validate childId if provided
//     if (childId && !isValidUUID(childId)) {
//       return next(new ErrorHandler("Invalid childId. Must be a valid UUID", 400));
//     }

//     // Build where conditions for goals
//     let goalWhereConditions = {};
//     let dateFilter = {};

//     // Date filtering
//     if (timeframe !== 'all') {
//       const now = new Date();
//       switch (timeframe) {
//         case 'week':
//           dateFilter.createdAt = {
//             [Op.gte]: new Date(now.setDate(now.getDate() - 7))
//           };
//           break;
//         case 'month':
//           dateFilter.createdAt = {
//             [Op.gte]: new Date(now.setMonth(now.getMonth() - 1))
//           };
//           break;
//         case 'quarter':
//           dateFilter.createdAt = {
//             [Op.gte]: new Date(now.setMonth(now.getMonth() - 3))
//           };
//           break;
//         case 'year':
//           dateFilter.createdAt = {
//             [Op.gte]: new Date(now.setFullYear(now.getFullYear() - 1))
//           };
//           break;
//         case 'custom':
//           if (startDate && endDate) {
//             dateFilter.createdAt = {
//               [Op.between]: [new Date(startDate), new Date(endDate)]
//             };
//           }
//           break;
//       }
//     }

//     // Get parent's children
//     const children = await models.Child.findAll({
//       where: {
//         parentId: req.parent.obj.id,
//         ...(childId ? { id: childId } : {})
//       },
//       attributes: ['id', 'name', 'createdAt'],
//       include: [
//         {
//           model: models.Goal,
//           as: 'goals',
//           where: dateFilter,
//           required: false,
//           include: [
//             {
//               model: models.Product,
//               as: 'products',
//               attributes: ['id', 'name'],
//               through: { attributes: [] },
//               required: false,
//               include: [
//                 {
//                   model: models.ProductVariant,
//                   as: 'variants',
//                   attributes: ['price', 'compare_at_price'],
//                   where: { is_active: true },
//                   required: false,
//                 }
//               ]
//             },
//             {
//               model: models.Task,
//               as: 'tasks',
//               attributes: ['id', 'status'],
//               through: { attributes: [] },
//               required: false,
//             }
//           ]
//         }
//       ]
//     });

//     if (!children || children.length === 0) {
//       return next(new ErrorHandler("No children found", 404));
//     }

//     // Process analytics for each child
//     const analyticsData = children.map(child => {
//       const goals = child.goals || [];

//       // Basic goal statistics
//       const totalGoals = goals.length;
//       const pendingGoals = goals.filter(g => g.status === 'PENDING').length;
//       const completedGoals = goals.filter(g => g.status === 'COMPLETED').length;
//       const approvedGoals = goals.filter(g => g.status === 'APPROVED').length;
//       const rejectedGoals = goals.filter(g => g.status === 'REJECTED').length;

//       // Goal type breakdown
//       const taskGoals = goals.filter(g => g.type === 'TASK').length;
//       const coinGoals = goals.filter(g => g.type === 'COIN').length;

//       // Success metrics
//       const completionRate = totalGoals > 0 ? ((completedGoals + approvedGoals) / totalGoals * 100).toFixed(2) : 0;
//       const approvalRate = completedGoals > 0 ? (approvedGoals / (approvedGoals + rejectedGoals) * 100).toFixed(2) : 0;

//       // Timeline analysis
//       const goalsThisMonth = goals.filter(g => {
//         const goalDate = new Date(g.createdAt);
//         const now = new Date();
//         return goalDate.getMonth() === now.getMonth() && goalDate.getFullYear() === now.getFullYear();
//       }).length;

//       const goalsThisYear = goals.filter(g => {
//         const goalDate = new Date(g.createdAt);
//         const now = new Date();
//         return goalDate.getFullYear() === now.getFullYear();
//       }).length;

//       // Average time to completion (for approved goals)
//       const approvedGoalsWithTimes = goals.filter(g =>
//         g.status === 'APPROVED' && g.completedAt && g.createdAt
//       );

//       let avgCompletionTime = 0;
//       if (approvedGoalsWithTimes.length > 0) {
//         const totalTime = approvedGoalsWithTimes.reduce((sum, goal) => {
//           const timeDiff = new Date(goal.completedAt) - new Date(goal.createdAt);
//           return sum + timeDiff;
//         }, 0);
//         avgCompletionTime = Math.round(totalTime / approvedGoalsWithTimes.length / (1000 * 60 * 60 * 24)); // in days
//       }

//       // Product value analysis
//       let totalProductValue = 0;
//       let approvedProductValue = 0;

//       goals.forEach(goal => {
//         if (goal.products && goal.products.length > 0) {
//           goal.products.forEach(product => {
//             if (product.variants && product.variants.length > 0) {
//               const minPrice = Math.min(...product.variants.map(v => v.price || 0));
//               totalProductValue += minPrice;
//               if (goal.status === 'APPROVED') {
//                 approvedProductValue += minPrice;
//               }
//             }
//           });
//         }
//       });

//       // Task completion analysis (for TASK type goals)
//       const taskGoalsWithTasks = goals.filter(g => g.type === 'TASK' && g.tasks && g.tasks.length > 0);
//       let taskCompletionStats = {
//         totalTasks: 0,
//         completedTasks: 0,
//         taskCompletionRate: 0
//       };

//       if (taskGoalsWithTasks.length > 0) {
//         taskGoalsWithTasks.forEach(goal => {
//           taskCompletionStats.totalTasks += goal.tasks.length;
//           taskCompletionStats.completedTasks += goal.tasks.filter(t =>
//             ['COMPLETED', 'APPROVED'].includes(t.status)
//           ).length;
//         });
//         taskCompletionStats.taskCompletionRate = taskCompletionStats.totalTasks > 0
//           ? (taskCompletionStats.completedTasks / taskCompletionStats.totalTasks * 100).toFixed(2)
//           : 0;
//       }

//       // Recent activity (last 7 days)
//       const recentGoals = goals.filter(g => {
//         const goalDate = new Date(g.updatedAt);
//         const weekAgo = new Date();
//         weekAgo.setDate(weekAgo.getDate() - 7);
//         return goalDate >= weekAgo;
//       });

//       // Monthly trend data (last 6 months)
//       const monthlyTrend = [];
//       for (let i = 5; i >= 0; i--) {
//         const date = new Date();
//         date.setMonth(date.getMonth() - i);
//         const monthGoals = goals.filter(g => {
//           const goalDate = new Date(g.createdAt);
//           return goalDate.getMonth() === date.getMonth() &&
//                  goalDate.getFullYear() === date.getFullYear();
//         });

//         monthlyTrend.push({
//           month: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
//           total: monthGoals.length,
//           completed: monthGoals.filter(g => ['COMPLETED', 'APPROVED'].includes(g.status)).length,
//           approved: monthGoals.filter(g => g.status === 'APPROVED').length,
//           rejected: monthGoals.filter(g => g.status === 'REJECTED').length
//         });
//       }

//       // Goal status distribution for charts
//       const statusDistribution = [
//         { status: 'PENDING', count: pendingGoals, percentage: totalGoals > 0 ? (pendingGoals / totalGoals * 100).toFixed(1) : 0 },
//         { status: 'COMPLETED', count: completedGoals, percentage: totalGoals > 0 ? (completedGoals / totalGoals * 100).toFixed(1) : 0 },
//         { status: 'APPROVED', count: approvedGoals, percentage: totalGoals > 0 ? (approvedGoals / totalGoals * 100).toFixed(1) : 0 },
//         { status: 'REJECTED', count: rejectedGoals, percentage: totalGoals > 0 ? (rejectedGoals / totalGoals * 100).toFixed(1) : 0 }
//       ];

//       return {
//         childId: child.id,
//         childName: child.name,
//         memberSince: child.createdAt,
//         summary: {
//           totalGoals,
//           pendingGoals,
//           completedGoals,
//           approvedGoals,
//           rejectedGoals,
//           completionRate: parseFloat(completionRate),
//           approvalRate: parseFloat(approvalRate)
//         },
//         goalTypes: {
//           taskGoals,
//           coinGoals,
//           taskPercentage: totalGoals > 0 ? (taskGoals / totalGoals * 100).toFixed(1) : 0,
//           coinPercentage: totalGoals > 0 ? (coinGoals / totalGoals * 100).toFixed(1) : 0
//         },
//         performance: {
//           avgCompletionTimeInDays: avgCompletionTime,
//           goalsThisMonth,
//           goalsThisYear,
//           recentActivityCount: recentGoals.length
//         },
//         financial: {
//           totalProductValue: totalProductValue.toFixed(2),
//           approvedProductValue: approvedProductValue.toFixed(2),
//           potentialSavings: (totalProductValue - approvedProductValue).toFixed(2)
//         },
//         taskAnalysis: taskCompletionStats,
//         trends: {
//           monthlyTrend,
//           statusDistribution
//         },
//         recentGoals: recentGoals.slice(0, 5).map(g => ({
//           id: g.id,
//           title: g.title,
//           type: g.type,
//           status: g.status,
//           updatedAt: g.updatedAt,
//           productsCount: g.products ? g.products.length : 0,
//           tasksCount: g.tasks ? g.tasks.length : 0
//         }))
//       };
//     });

//     // If single child requested, return just that child's data
//     if (childId) {
//       return res.status(200).json({
//         success: true,
//         message: "Goal analytics retrieved successfully",
//         data: analyticsData[0]
//       });
//     }

//     // For multiple children, also provide parent-level summary
//     const parentSummary = {
//       totalChildren: children.length,
//       totalGoalsAcrossChildren: analyticsData.reduce((sum, child) => sum + child.summary.totalGoals, 0),
//       totalApprovedGoals: analyticsData.reduce((sum, child) => sum + child.summary.approvedGoals, 0),
//       totalProductValue: analyticsData.reduce((sum, child) => sum + parseFloat(child.financial.totalProductValue), 0).toFixed(2),
//       totalApprovedValue: analyticsData.reduce((sum, child) => sum + parseFloat(child.financial.approvedProductValue), 0).toFixed(2),
//       avgCompletionRateAcrossChildren: analyticsData.length > 0
//         ? (analyticsData.reduce((sum, child) => sum + child.summary.completionRate, 0) / analyticsData.length).toFixed(2)
//         : 0,
//       mostActiveChild: analyticsData.reduce((prev, current) =>
//         (current.summary.totalGoals > prev.summary.totalGoals) ? current : prev,
//         analyticsData[0]
//       )?.childName || null
//     };

//     return res.status(200).json({
//       success: true,
//       message: "Goal analytics retrieved successfully",
//       data: {
//         parentSummary,
//         childrenAnalytics: analyticsData,
//         generatedAt: new Date().toISOString(),
//         timeframe,
//         dateRange: timeframe === 'custom' && startDate && endDate
//           ? { startDate, endDate }
//           : null
//       }
//     });

//   } catch (error) {
//     console.error("Error retrieving goal analytics:", error);
//     return next(
//       new ErrorHandler(error.message || "Failed to retrieve goal analytics", 500)
//     );
//   }
// });

const getGoalAnalytics = asyncHandler(async (req, res, next) => {
  const { goalId } = req.params;
  const { timeline = "days", startDate, endDate, type, childId } = req.query; // timeline: 'days', 'weeks', 'months'

  try {
    // Validate goalId
    if (!isValidUUID(goalId)) {
      return next(
        new ErrorHandler("Invalid goalId. Must be a valid UUID", 400)
      );
    }

    // Validate timeline parameter
    const validTimelines = ["days", "weeks", "months"];
    if (!validTimelines.includes(timeline)) {
      return next(
        new ErrorHandler(
          "Invalid timeline. Must be 'days', 'weeks', or 'months'",
          400
        )
      );
    }

    // Validate type filter if provided
    if (type && !["TASK", "COIN"].includes(type)) {
      return next(
        new ErrorHandler("Invalid type. Must be 'TASK' or 'COIN'", 400)
      );
    }

    // Validate childId if provided
    if (childId && !isValidUUID(childId)) {
      return next(
        new ErrorHandler("Invalid childId. Must be a valid UUID", 400)
      );
    }

    // Validate date range if provided
    let dateFilter = {};
    if (startDate || endDate) {
      const start = startDate ? moment(startDate) : null;
      const end = endDate ? moment(endDate) : null;

      if (start && !start.isValid()) {
        return next(
          new ErrorHandler("Invalid startDate format. Use YYYY-MM-DD", 400)
        );
      }
      if (end && !end.isValid()) {
        return next(
          new ErrorHandler("Invalid endDate format. Use YYYY-MM-DD", 400)
        );
      }
      if (start && end && start.isAfter(end)) {
        return next(new ErrorHandler("startDate cannot be after endDate", 400));
      }

      // Build date filter for completedAt
      if (start)
        dateFilter.completedAt = {
          ...dateFilter.completedAt,
          [Op.gte]: start.toDate(),
        };
      if (end)
        dateFilter.completedAt = {
          ...dateFilter.completedAt,
          [Op.lte]: end.endOf("day").toDate(),
        };
    }

    // Fetch the goal
    const goal = await models.Goal.findByPk(goalId, {
      include: [
        {
          model: models.Child,
          as: "child",
          attributes: ["id", "name", "age"],
        },
        // {
        //   model: models.Product,
        //   as: 'products',
        //   attributes: ['id', 'name', 'price'],
        //   through: { attributes: [] } // Exclude junction table attributes
        // },
        {
          model: models.Task,
          as: "tasks",
          attributes: ["id", "status", "completedAt", "rewardCoins"],
          through: { attributes: [] }, // Exclude junction table attributes
        },
      ],
    });

    if (!goal) {
      return next(new ErrorHandler("Goal not found", 404));
    }

    // Build where clause for goal filtering
    const goalWhereClause = {
      id: goalId,
      ...dateFilter,
    };

    // Add type filter if specified
    if (type) {
      goalWhereClause.type = type;
    }

    // Add child filter if specified
    if (childId) {
      goalWhereClause.childId = childId;
    }

    // Fetch goal with related data for analytics
    const goalData = await models.Goal.findOne({
      where: goalWhereClause,
      include: [
        {
          model: models.Child,
          as: "child",
          attributes: ["id", "name", "age"],
        },
        // {
        //   model: models.Product,
        //   as: 'products',
        //   attributes: ['id', 'name', 'price'],
        //   through: { attributes: [] }
        // },
        {
          model: models.Task,
          as: "tasks",
          attributes: [
            "id",
            "status",
            "completedAt",
            "rewardCoins",
            "createdAt",
          ],
          through: { attributes: [] },
        },
      ],
    });

    if (!goalData) {
      return res.status(200).json({
        success: true,
        message: "No goal data found matching the criteria",
        data: {
          completionRate: 0,
          averageCompletionTime: null,
          rejectionRate: 0,
          timeline: {
            type: timeline,
            data: [],
            summary: {
              totalPeriods: 0,
              mostActiveLabel: null,
              mostActiveCount: 0,
              leastActiveLabel: null,
              leastActiveCount: 0,
            },
          },
          goalBreakdown: {
            totalGoals: 0,
            completedGoals: 0,
            approvedGoals: 0,
            rejectedGoals: 0,
            pendingGoals: 0,
          },
          taskProgress: {
            totalTasks: 0,
            completedTasks: 0,
            completionRate: 0,
            totalRewardCoins: 0,
          },
          // productAnalysis: {
          //   totalProducts: 0,
          //   totalValue: 0
          // }
        },
      });
    }

    // Initialize analytics variables
    let completedGoals = 0;
    let rejectedGoals = 0;
    let pendingGoals = 0;
    let approvedGoals = 0;
    let totalCompletionTime = 0;
    let completionTimesCount = 0;
    const timelineCounts = new Map();

    // Analyze goal status
    const { status, completedAt, createdAt, approvedAt, rejectedAt } = goalData;

    // Count by status
    switch (status) {
      case "COMPLETED":
        completedGoals++;
        break;
      case "APPROVED":
        approvedGoals++;
        break;
      case "REJECTED":
        rejectedGoals++;
        break;
      case "PENDING":
        pendingGoals++;
        break;
    }

    // Calculate completion metrics for completed and approved goals
    if (status === "COMPLETED" || status === "APPROVED") {
      const completionDate = completedAt || approvedAt || createdAt;

      if (completionDate && createdAt) {
        // Average completion time calculation
        const completionTime = moment(completionDate).diff(
          moment(createdAt),
          "hours"
        );
        totalCompletionTime += Math.abs(completionTime);
        completionTimesCount++;

        // Timeline analysis based on completion date
        const dateMoment = moment(completionDate);
        let timelineKey;
        let timelineLabel;

        switch (timeline) {
          case "days":
            timelineKey = dateMoment.format("YYYY-MM-DD");
            timelineLabel = dateMoment.format("dddd, MMM DD");
            break;
          case "weeks":
            const weekStart = dateMoment.clone().startOf("isoWeek");
            const weekEnd = dateMoment.clone().endOf("isoWeek");
            timelineKey = `${dateMoment.isoWeekYear()}-W${dateMoment.isoWeek()}`;
            timelineLabel = `Week ${dateMoment.isoWeek()}, ${dateMoment.isoWeekYear()} (${weekStart.format(
              "MMM DD"
            )} - ${weekEnd.format("MMM DD")})`;
            break;
          case "months":
            timelineKey = dateMoment.format("YYYY-MM");
            timelineLabel = dateMoment.format("MMMM YYYY");
            break;
        }

        if (timelineKey && timelineLabel) {
          const current = timelineCounts.get(timelineKey) || {
            key: timelineKey,
            label: timelineLabel,
            count: 0,
            date: dateMoment.toDate(),
          };
          current.count += 1;
          timelineCounts.set(timelineKey, current);
        }
      }
    }

    // Analyze associated tasks
    const tasks = goalData.tasks || [];
    let completedTasks = 0;
    let totalRewardCoins = 0;

    tasks.forEach((task) => {
      if (task.status === "COMPLETED" || task.status === "APPROVED") {
        completedTasks++;
      }
      if (task.rewardCoins) {
        totalRewardCoins += task.rewardCoins;
      }
    });

    // Analyze associated products
    const products = goalData.products || [];
    let totalProductValue = 0;

    products.forEach((product) => {
      if (product.price) {
        totalProductValue += parseFloat(product.price);
      }
    });

    // Calculate analytics
    const totalGoals = 1; // Single goal analysis
    const completionRate =
      totalGoals > 0
        ? parseFloat(
            (((completedGoals + approvedGoals) / totalGoals) * 100).toFixed(2)
          )
        : 0;
    const rejectionRate =
      totalGoals > 0
        ? parseFloat(((rejectedGoals / totalGoals) * 100).toFixed(2))
        : 0;
    const averageCompletionTime =
      completionTimesCount > 0
        ? parseFloat((totalCompletionTime / completionTimesCount).toFixed(2))
        : null;

    // Process timeline data
    const timelineData = Array.from(timelineCounts.values())
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((item) => ({
        key: item.key,
        label: item.label,
        count: item.count,
        percentage:
          totalGoals > 0
            ? parseFloat(((item.count / totalGoals) * 100).toFixed(2))
            : 0,
      }));

    // Timeline summary
    const timelineSummary = {
      totalPeriods: timelineData.length,
      mostActiveLabel: null,
      mostActiveCount: 0,
      leastActiveLabel: null,
      leastActiveCount: 0,
    };

    if (timelineData.length > 0) {
      const sortedByCount = [...timelineData].sort((a, b) => b.count - a.count);
      timelineSummary.mostActiveLabel = sortedByCount[0].label;
      timelineSummary.mostActiveCount = sortedByCount[0].count;
      timelineSummary.leastActiveLabel =
        sortedByCount[sortedByCount.length - 1].label;
      timelineSummary.leastActiveCount =
        sortedByCount[sortedByCount.length - 1].count;
    }

    // Task completion rate
    const taskCompletionRate =
      tasks.length > 0
        ? parseFloat(((completedTasks / tasks.length) * 100).toFixed(2))
        : 0;

    // Return comprehensive analytics
    return res.status(200).json({
      success: true,
      message: "Goal analytics fetched successfully",
      data: {
        // Core metrics
        completionRate,
        averageCompletionTime: averageCompletionTime
          ? `${averageCompletionTime} hours`
          : null,
        rejectionRate,

        // Timeline data with filtering
        timeline: {
          type: timeline,
          data: timelineData,
          summary: timelineSummary,
          dateRange: {
            startDate: startDate || null,
            endDate: endDate || null,
          },
        },

        // Goal status breakdown
        goalBreakdown: {
          totalGoals,
          completedGoals,
          approvedGoals,
          rejectedGoals,
          pendingGoals,
          statusDistribution: {
            completed: parseFloat(
              ((completedGoals / totalGoals) * 100).toFixed(2)
            ),
            approved: parseFloat(
              ((approvedGoals / totalGoals) * 100).toFixed(2)
            ),
            rejected: parseFloat(
              ((rejectedGoals / totalGoals) * 100).toFixed(2)
            ),
            pending: parseFloat(((pendingGoals / totalGoals) * 100).toFixed(2)),
          },
        },

        // Task progress analysis
        taskProgress: {
          totalTasks: tasks.length,
          completedTasks,
          completionRate: taskCompletionRate,
          totalRewardCoins,
          averageRewardPerTask:
            tasks.length > 0
              ? parseFloat((totalRewardCoins / tasks.length).toFixed(2))
              : 0,
          taskStatusBreakdown: {
            completed: tasks.filter((t) => t.status === "COMPLETED").length,
            approved: tasks.filter((t) => t.status === "APPROVED").length,
            rejected: tasks.filter((t) => t.status === "REJECTED").length,
            pending: tasks.filter((t) => t.status === "PENDING").length,
            overdue: tasks.filter((t) => t.status === "OVERDUE").length,
          },
        },

        // Product analysis
        productAnalysis: {
          totalProducts: products.length,
          totalValue: parseFloat(totalProductValue.toFixed(2)),
          averageProductValue:
            products.length > 0
              ? parseFloat((totalProductValue / products.length).toFixed(2))
              : 0,
          products: products.map((product) => ({
            id: product.id,
            name: product.name,
            price: product.price || 0,
          })),
        },

        // Goal details
        goalDetails: {
          id: goalData.id,
          title: goalData.title,
          description: goalData.description,
          image: goalData.image,
          type: goalData.type,
          status: goalData.status,
          createdAt: goalData.createdAt,
          completedAt: goalData.completedAt,
          approvedAt: goalData.approvedAt,
          rejectedAt: goalData.rejectedAt,
          rejectionReason: goalData.rejectionReason,
          child: goalData.child
            ? {
                id: goalData.child.id,
                name: goalData.child.name,
                age: goalData.child.age,
              }
            : null,
        },

        // Query parameters used
        filters: {
          timeline,
          startDate: startDate || null,
          endDate: endDate || null,
          type: type || null,
          childId: childId || null,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching goal analytics:", error);
    return next(
      new ErrorHandler(error.message || "Failed to fetch goal analytics", 500)
    );
  }
});

// Analytics for multiple goals (child-level or overall)
const getGoalsAnalytics = asyncHandler(async (req, res, next) => {
  const { childId } = req.params; // Optional: for child-specific analytics
  const { timeline = "days", startDate, endDate, type, status } = req.query;

  try {
    // Validate childId if provided
    if (childId && !isValidUUID(childId)) {
      return next(
        new ErrorHandler("Invalid childId. Must be a valid UUID", 400)
      );
    }

    // Validate timeline parameter
    const validTimelines = ["days", "weeks", "months"];
    if (!validTimelines.includes(timeline)) {
      return next(
        new ErrorHandler(
          "Invalid timeline. Must be 'days', 'weeks', or 'months'",
          400
        )
      );
    }

    // Validate type filter if provided
    if (type && !["TASK", "COIN"].includes(type)) {
      return next(
        new ErrorHandler("Invalid type. Must be 'TASK' or 'COIN'", 400)
      );
    }

    // Validate status filter if provided
    if (
      status &&
      !["PENDING", "COMPLETED", "APPROVED", "REJECTED"].includes(status)
    ) {
      return next(
        new ErrorHandler(
          "Invalid status. Must be 'PENDING', 'COMPLETED', 'APPROVED', or 'REJECTED'",
          400
        )
      );
    }

    // Validate date range if provided
    let dateFilter = {};
    if (startDate || endDate) {
      const start = startDate ? moment(startDate) : null;
      const end = endDate ? moment(endDate) : null;

      if (start && !start.isValid()) {
        return next(
          new ErrorHandler("Invalid startDate format. Use YYYY-MM-DD", 400)
        );
      }
      if (end && !end.isValid()) {
        return next(
          new ErrorHandler("Invalid endDate format. Use YYYY-MM-DD", 400)
        );
      }
      if (start && end && start.isAfter(end)) {
        return next(new ErrorHandler("startDate cannot be after endDate", 400));
      }

      // Build date filter for completedAt
      if (start)
        dateFilter.completedAt = {
          ...dateFilter.completedAt,
          [Op.gte]: start.toDate(),
        };
      if (end)
        dateFilter.completedAt = {
          ...dateFilter.completedAt,
          [Op.lte]: end.endOf("day").toDate(),
        };
    }

    // Build where clause for goals
    const goalWhereClause = {
      ...dateFilter,
    };

    // Add filters
    if (childId) goalWhereClause.childId = childId;
    if (type) goalWhereClause.type = type;
    if (status) goalWhereClause.status = status;

    // Fetch goals with related data
    const goals = await models.Goal.findAll({
      where: goalWhereClause,
      include: [
        {
          model: models.Child,
          as: "child",
          attributes: ["id", "name", "age"],
        },
        {
          model: models.Product,
          as: "products",
          attributes: ["id", "name", "price"],
          through: { attributes: [] },
        },
        {
          model: models.Task,
          as: "tasks",
          attributes: ["id", "status", "completedAt", "rewardCoins"],
          through: { attributes: [] },
        },
      ],
    });

    if (goals.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No goals found matching the criteria",
        data: {
          completionRate: 0,
          averageCompletionTime: null,
          rejectionRate: 0,
          timeline: {
            type: timeline,
            data: [],
            summary: {
              totalPeriods: 0,
              mostActiveLabel: null,
              mostActiveCount: 0,
              leastActiveLabel: null,
              leastActiveCount: 0,
            },
          },
          goalBreakdown: {
            totalGoals: 0,
            completedGoals: 0,
            approvedGoals: 0,
            rejectedGoals: 0,
            pendingGoals: 0,
          },
          typeAnalysis: {
            taskGoals: 0,
            coinGoals: 0,
          },
          ageGroupAnalysis: [],
        },
      });
    }

    // Initialize analytics variables
    let completedGoals = 0;
    let rejectedGoals = 0;
    let pendingGoals = 0;
    let approvedGoals = 0;
    let totalCompletionTime = 0;
    let completionTimesCount = 0;
    const timelineCounts = new Map();
    const ageGroupCounts = new Map();
    const typeCounts = { TASK: 0, COIN: 0 };

    // Process each goal
    goals.forEach((goal) => {
      const { status, completedAt, createdAt, approvedAt, type, child } = goal;

      // Count by status
      switch (status) {
        case "COMPLETED":
          completedGoals++;
          break;
        case "APPROVED":
          approvedGoals++;
          break;
        case "REJECTED":
          rejectedGoals++;
          break;
        case "PENDING":
          pendingGoals++;
          break;
      }

      // Count by type
      if (type) {
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      }

      // Age group analysis
      if (child && child.age !== null && child.age !== undefined) {
        const age = parseInt(child.age);
        if (!isNaN(age) && age >= 0) {
          const ageGroupStart = Math.floor(age / 5) * 5;
          const ageGroupEnd = ageGroupStart + 4;
          const ageGroupKey = `${ageGroupStart}-${ageGroupEnd}`;

          const current = ageGroupCounts.get(ageGroupKey) || {
            ageGroup: ageGroupKey,
            minAge: ageGroupStart,
            maxAge: ageGroupEnd,
            count: 0,
          };
          current.count += 1;
          ageGroupCounts.set(ageGroupKey, current);
        }
      }

      // Timeline analysis for completed goals
      if (status === "COMPLETED" || status === "APPROVED") {
        const completionDate = completedAt || approvedAt || createdAt;

        if (completionDate && createdAt) {
          // Average completion time calculation
          const completionTime = moment(completionDate).diff(
            moment(createdAt),
            "hours"
          );
          totalCompletionTime += Math.abs(completionTime);
          completionTimesCount++;

          // Timeline analysis based on completion date
          const dateMoment = moment(completionDate);
          let timelineKey;
          let timelineLabel;

          switch (timeline) {
            case "days":
              timelineKey = dateMoment.format("YYYY-MM-DD");
              timelineLabel = dateMoment.format("dddd, MMM DD");
              break;
            case "weeks":
              const weekStart = dateMoment.clone().startOf("isoWeek");
              const weekEnd = dateMoment.clone().endOf("isoWeek");
              timelineKey = `${dateMoment.isoWeekYear()}-W${dateMoment.isoWeek()}`;
              timelineLabel = `Week ${dateMoment.isoWeek()}, ${dateMoment.isoWeekYear()} (${weekStart.format(
                "MMM DD"
              )} - ${weekEnd.format("MMM DD")})`;
              break;
            case "months":
              timelineKey = dateMoment.format("YYYY-MM");
              timelineLabel = dateMoment.format("MMMM YYYY");
              break;
          }

          if (timelineKey && timelineLabel) {
            const current = timelineCounts.get(timelineKey) || {
              key: timelineKey,
              label: timelineLabel,
              count: 0,
              date: dateMoment.toDate(),
            };
            current.count += 1;
            timelineCounts.set(timelineKey, current);
          }
        }
      }
    });

    // Calculate analytics
    const totalGoals = goals.length;
    const completionRate =
      totalGoals > 0
        ? parseFloat(
            (((completedGoals + approvedGoals) / totalGoals) * 100).toFixed(2)
          )
        : 0;
    const rejectionRate =
      totalGoals > 0
        ? parseFloat(((rejectedGoals / totalGoals) * 100).toFixed(2))
        : 0;
    const averageCompletionTime =
      completionTimesCount > 0
        ? parseFloat((totalCompletionTime / completionTimesCount).toFixed(2))
        : null;

    // Process timeline data
    const timelineData = Array.from(timelineCounts.values())
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((item) => ({
        key: item.key,
        label: item.label,
        count: item.count,
        percentage:
          totalGoals > 0
            ? parseFloat(((item.count / totalGoals) * 100).toFixed(2))
            : 0,
      }));

    // Timeline summary
    const timelineSummary = {
      totalPeriods: timelineData.length,
      mostActiveLabel: null,
      mostActiveCount: 0,
      leastActiveLabel: null,
      leastActiveCount: 0,
    };

    if (timelineData.length > 0) {
      const sortedByCount = [...timelineData].sort((a, b) => b.count - a.count);
      timelineSummary.mostActiveLabel = sortedByCount[0].label;
      timelineSummary.mostActiveCount = sortedByCount[0].count;
      timelineSummary.leastActiveLabel =
        sortedByCount[sortedByCount.length - 1].label;
      timelineSummary.leastActiveCount =
        sortedByCount[sortedByCount.length - 1].count;
    }

    // Process age group data
    const ageGroupAnalysis = Array.from(ageGroupCounts.values())
      .sort((a, b) => a.minAge - b.minAge)
      .map((item) => ({
        ageGroup: item.ageGroup,
        count: item.count,
        percentage:
          totalGoals > 0
            ? parseFloat(((item.count / totalGoals) * 100).toFixed(2))
            : 0,
      }));

    // Return comprehensive analytics
    return res.status(200).json({
      success: true,
      message: "Goals analytics fetched successfully",
      data: {
        // Core metrics
        completionRate,
        averageCompletionTime: averageCompletionTime
          ? `${averageCompletionTime} hours`
          : null,
        rejectionRate,

        // Timeline data with filtering
        timeline: {
          type: timeline,
          data: timelineData,
          summary: timelineSummary,
          dateRange: {
            startDate: startDate || null,
            endDate: endDate || null,
          },
        },

        // Goal status breakdown
        goalBreakdown: {
          totalGoals,
          completedGoals,
          approvedGoals,
          rejectedGoals,
          pendingGoals,
          statusDistribution: {
            completed:
              totalGoals > 0
                ? parseFloat(((completedGoals / totalGoals) * 100).toFixed(2))
                : 0,
            approved:
              totalGoals > 0
                ? parseFloat(((approvedGoals / totalGoals) * 100).toFixed(2))
                : 0,
            rejected:
              totalGoals > 0
                ? parseFloat(((rejectedGoals / totalGoals) * 100).toFixed(2))
                : 0,
            pending:
              totalGoals > 0
                ? parseFloat(((pendingGoals / totalGoals) * 100).toFixed(2))
                : 0,
          },
        },

        // Type analysis
        typeAnalysis: {
          taskGoals: typeCounts.TASK || 0,
          coinGoals: typeCounts.COIN || 0,
          taskGoalsPercentage:
            totalGoals > 0
              ? parseFloat(
                  (((typeCounts.TASK || 0) / totalGoals) * 100).toFixed(2)
                )
              : 0,
          coinGoalsPercentage:
            totalGoals > 0
              ? parseFloat(
                  (((typeCounts.COIN || 0) / totalGoals) * 100).toFixed(2)
                )
              : 0,
        },

        // Age group analysis
        ageGroupAnalysis,

        // Query parameters used
        filters: {
          timeline,
          startDate: startDate || null,
          endDate: endDate || null,
          type: type || null,
          status: status || null,
          childId: childId || null,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching goals analytics:", error);
    return next(
      new ErrorHandler(error.message || "Failed to fetch goals analytics", 500)
    );
  }
});

module.exports = {
  createGoal,
  getAllGoals,
  getGoalById,
  updateGoal,
  deleteGoal,
  getGoalAnalytics,
  // getGoalAnalytics,
  getGoalsAnalytics,
};
