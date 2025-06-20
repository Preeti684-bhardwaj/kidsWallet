const { Op } = require("sequelize");
const models = require("../../Modals/index");
const {
  uploadFiles,
  uploadFile,
  deleteFile,
} = require("../../Utils/cdnImplementation");
const ErrorHandler = require("../../Utils/errorHandle");
const asyncHandler = require("../../Utils/asyncHandler");
const { Category ,Product} = models;

const createCategory = asyncHandler(async (req, res, next) => {
  const transaction = await models.db.sequelize.transaction();
  try {
    const { name, description, is_active, parentId } = req.body;

    // Validate required fields
    if (!name) {
      return next(new ErrorHandler("Category name is required", 400));
    }
    const existingCategory = await Category.findOne({
      where: { name: name.trim() },
      transaction,
    });
    //   console.log("existing",existingCategory);

    if (existingCategory) {
      return next(
        new ErrorHandler("A category with this name already exists", 400)
      );
    }
    // Handle image upload
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
        return res.status(500).json({
          success: false,
          message: "Image upload failed",
          error: uploadError.message,
        });
      }
    }
    let parentCategory = null;
    if (parentId) {
      parentCategory = await Category.findOne(
        { where: { id: parentId } },
        { transaction }
      );
      if (!parentCategory) {
        return next(new ErrorHandler("Parent category not found", 404));
      }
    }
    // Create category
    const category = await Category.create(
      {
        name,
        description,
        is_active: is_active ?? true,
        image: imageData,
        parentId: parentId || null,
      },
      { transaction }
    );

    await transaction.commit();
    const categoryData = await Category.findByPk(category.id, {
      include: [
        { model: Category, as: "subcategories" },
        { model: Category, as: "parent" },
      ],
    });
    return res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: categoryData,
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message,500));
  }
});

const getCategorieById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  try {
    const category = await Category.findByPk(id, {
      include: [
        { model: Category, as: "subcategories" },
        { model: Category, as: "parent" },
      ],
    });

    if (!category) {
      return next(new ErrorHandler("Category not found", 404));
    }

    return res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    return next(new ErrorHandler( error.message,500));
  }
});

const getAllCategories = asyncHandler(async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      is_active,
      include_products = false,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const whereClause = {
      parentId: null // Only fetch parent categories (those without a parent)
    };

    // Search filter
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // Active status filter
    if (is_active !== undefined) {
      whereClause.is_active = is_active === "true";
    }

    const includeOptions = [];

    // Include subcategories with their own subcategories (recursive)
    const subcategoryInclude = {
      model: Category,
      as: "subcategories",
      required: false,
      include: [
        {
          model: Category,
          as: "subcategories", // Nested subcategories
          required: false,
        }
      ]
    };

    // Add products to subcategories if requested
    if (include_products === "true") {
      subcategoryInclude.include.push({
        model: Product,
        as: "products",
        required: false,
        attributes: ["id", "name", "status"],
      });
    }

    includeOptions.push(subcategoryInclude);

    // Include products in parent category if requested
    if (include_products === "true") {
      includeOptions.push({
        model: Product,
        as: "products",
        required: false,
        attributes: ["id", "name", "status"],
      });
    }

    const { count, rows: categories } = await Category.findAndCountAll({
      where: whereClause,
      include: includeOptions,
      limit: parseInt(limit),
      offset: offset,
      order: [["createdAt", "DESC"]],
      distinct: true, // Ensures count is accurate when using includes
    });

    const totalPages = Math.ceil(count / parseInt(limit));

    return res.status(200).json({
      success: true,
      data: {
        categories,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: count,
          itemsPerPage: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

const updateCategory = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, is_active } = req.body;

    if (!id) {
       return next(new ErrorHandler("Category ID is required",400));
    }

    const category = await Category.findByPk(id);
    if (!category) {
       return next(new ErrorHandler("Category not found",404));
    }

    // Check if name is being updated and already exists
    if (name && name.trim() !== category.name) {
      const existingCategory = await Category.findOne({
        where: {
          name: name.trim(),
          id: { [Op.ne]: id },
        },
      });

      if (existingCategory) {
         return next(new ErrorHandler("Category with this name already exists",409));
      }
    }

    // Handle image upload
    let imageData = category.image;
    if (req.file) {
      try {
        // Delete old image if exists
        if (category.image && category.image.filename) {
          try {
            await deleteFile(category.image.filename);
          } catch (deleteError) {
            console.warn("Failed to delete old image:", deleteError.message);
          }
        }

        // Upload new image
        const uploadResult = await uploadFile(req.file);
        imageData = {
          url: uploadResult.url,
          filename: uploadResult.filename,
          originalName: uploadResult.originalName,
          size: uploadResult.size,
          mimetype: uploadResult.mimetype,
        };
      } catch (uploadError) {
        return next(new ErrorHandler(uploadError.message,500));
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined)
      updateData.description = description?.trim() || null;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (imageData !== category.image) updateData.image = imageData;

    await category.update(updateData);

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: category,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

const deleteCategory = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { force = false } = req.query;

    if (!id) {
        return next(new ErrorHandler( "Category ID is required",400));
    }

    const category = await Category.findByPk(id, {
      include: [
        { model: Category, as: "subcategories" },
        { model: Product, as: "products" },
      ],
    });

    if (!category) {
        return next(new ErrorHandler("Category not found",404));
    }

    // Check for dependencies
    if (!force) {
      if (category.subcategories && category.subcategories.length > 0) {
        return res.status(409).json({
          success: false,
          message:
            "Cannot delete category with subcategories. Use force=true to cascade delete.",
          subcategories: category.subcategories.length,
        });
      }

      if (category.products && category.products.length > 0) {
        return res.status(409).json({
          success: false,
          message:
            "Cannot delete category with associated products. Use force=true to cascade delete.",
          products: category.products.length,
        });
      }
    }

    // Delete associated image
    if (category.image && category.image.filename) {
      try {
        await deleteFile(category.image.filename);
      } catch (deleteError) {
        console.warn("Failed to delete category image:", deleteError.message);
      }
    }

    await category.destroy();

    return res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    return next(new ErrorHandler(error.message,500));
  }
});

module.exports = {
  createCategory,
  getCategorieById,
  getAllCategories,
  updateCategory,
  deleteCategory,
};
