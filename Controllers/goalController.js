const models = require("../Modals/index");
const { Op, literal } = require("sequelize");
const db = require("../Configs/db/DbConfig");
const sequelize = db.sequelize;
const moment = require("moment");
// const {
//   calculateDefaultReward,
//   sortRecurrenceDates,
//   validateQueryParams,
// } = require("../Utils/taskHelper");
const { v4: uuidv4, validate: isValidUUID } = require("uuid");
const { uploadFile, deleteFile } = require("../Utils/cdnImplementation");
const ErrorHandler = require("../Utils/errorHandle");
const asyncHandler = require("../Utils/asyncHandler");

//---------------------Create a new goal template (Both Parent and Admin)------------------------------------
const createGoalTemplate = asyncHandler(async (req, res, next) => {
  const { title, description } = req.body;

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

    // Check if goal template with same title already exists
    const existingTemplate = await models.GoalTemplate.findOne({
      where: { title: trimmedTitle },
    });
    if (existingTemplate) {
      return next(
        new ErrorHandler("Goal template with this title already exists", 400)
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
    let goalTemplateData = {
      title: trimmedTitle,
      description,
      image: imageData,
    };

    if (req.userType === "parent") {
      goalTemplateData.userId = req.parent.id;
      goalTemplateData.adminId = null; // Explicitly set to null
      console.log("Creating template for parent:", req.parent.id);
    } else if (req.userType === "admin") {
      goalTemplateData.adminId = req.admin.id;
      goalTemplateData.userId = null; // Explicitly set to null
      console.log("Creating template for admin:", req.admin.id);
    } else {
      return next(new ErrorHandler("Invalid user type", 400));
    }

    const goalTemplate = await models.GoalTemplate.create(goalTemplateData);

    return res.status(201).json({
      success: true,
      message: "Goal template created successfully",
      data: {
        id: goalTemplate.id,
        title: goalTemplate.title,
        description: goalTemplate.description,
        image: goalTemplate.image,
        userId: goalTemplate.userId,
        adminId: goalTemplate.adminId,
        createdBy: req.userType,
      },
    });
  } catch (error) {
    console.error("Error creating goal template:", error);
    return next(
      new ErrorHandler(error.message || "Failed to create goal template", 500)
    );
  }
});

//--------------------Get all goal templates with filtering and pagination---------------------------------------------------------
const getAllGoalTemplate = asyncHandler(async (req, res, next) => {
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

    // Add search filter
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
            [Op.or]: [
              { title: { [Op.iLike]: `%${searchTerm}%` } },
              { description: { [Op.iLike]: `%${searchTerm}%` } },
            ],
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
    const { count, rows: goalTemplates } =
      await models.GoalTemplate.findAndCountAll({
        where: whereCondition,
        order: [[finalSortBy, finalSortOrder]],
        limit: limitNum,
        offset: offset,
        attributes: [
          "id",
          "title",
          "description",
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
    const templatesWithCreator = goalTemplates.map((template) => {
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
      message: "Goal templates fetched successfully",
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
    console.error("Error fetching goal templates:", error);
    return next(
      new ErrorHandler(error.message || "Failed to fetch goal templates", 500)
    );
  }
});

module.exports = {
  createGoalTemplate,
  getAllGoalTemplate,
};