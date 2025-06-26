const { Op } = require("sequelize");
const models = require("../../Modals/index");
const { uploadFile, deleteFile } = require("../../Utils/cdnImplementation");
const ErrorHandler = require("../../Utils/errorHandle");
const asyncHandler = require("../../Utils/asyncHandler");
const { Product, Category, ProductVariant, ProductInventory, ProductLocation } =
  models;
const {
  validateProductData,
  validateSpecifications,
} = require("../../Validators/productValidation");

// Helper function to extract filename from URL
const extractFilenameFromUrl = (url) => {
  try {
    const urlParts = url.split('/');
    return urlParts[urlParts.length - 1];
  } catch (error) {
    console.error('Error extracting filename from URL:', error);
    return null;
  }
};

// Helper function to delete multiple files from CDN
const deleteMultipleFiles = async (filesToDelete) => {
  const deletePromises = filesToDelete.map(async (file) => {
    try {
      let filename;
      
      // If it's a URL object with filename property
      if (typeof file === 'object' && file.filename) {
        filename = file.filename;
      }
      // If it's a URL object with url property
      else if (typeof file === 'object' && file.url) {
        filename = extractFilenameFromUrl(file.url);
      }
      // If it's a string URL
      else if (typeof file === 'string') {
        filename = extractFilenameFromUrl(file);
      }
      
      if (filename) {
        await deleteFile(filename);
        console.log(`Successfully deleted file: ${filename}`);
      }
    } catch (error) {
      console.error(`Failed to delete file:`, error);
      // Don't throw here - we want to continue deleting other files
    }
  });
  
  await Promise.allSettled(deletePromises);
};



// Create Product
const createProduct = asyncHandler(async (req, res, next) => {
  const transaction = await models.db.sequelize.transaction();

  try {
    const {
      name,
      description,
      type,
      vendor,
      seo_title,
      seo_description,
      status,
      specifications,
      category_id,
    } = req.body;

    // Validate required fields and data
    const validationErrors = validateProductData(req.body);
    const specErrors = validateSpecifications(specifications);

    if (validationErrors.length > 0 || specErrors.length > 0) {
      await transaction.rollback();
      return next(
        new ErrorHandler([...validationErrors, ...specErrors].join(", "), 400)
      );
    }

    // Check if product with same name already exists
    // const existingProduct = await Product.findOne({
    //   where: { name: name.trim() },
    //   transaction,
    // });

    // if (existingProduct) {
    //   await transaction.rollback();
    //   return next(
    //     new ErrorHandler("A product with this name already exists", 400)
    //   );
    // }

    // Validate category if provided
    let category = null;
    if (category_id) {
      category = await Category.findOne({
        where: { id: category_id, is_active: true },
        transaction,
      });

      if (!category) {
        await transaction.rollback();
        return next(new ErrorHandler("Invalid or inactive category", 404));
      }
    }

    // Handle multiple image uploads
    let imagesData = [];
    if (req.files && req.files.length > 0) {
      try {
        // Limit number of images (e.g., max 10)
        if (req.files.length > 10) {
          await transaction.rollback();
          return next(
            new ErrorHandler("Maximum 10 images allowed per product", 400)
          );
        }

        for (const file of req.files) {
          const uploadResult = await uploadFile(file);
          imagesData.push({
            url: uploadResult.url,
            filename: uploadResult.filename,
            originalName: uploadResult.originalName,
            size: uploadResult.size,
            mimetype: uploadResult.mimetype,
          });
        }
      } catch (uploadError) {
        await transaction.rollback();
        return next(
          new ErrorHandler(`Image upload failed: ${uploadError.message}`, 500)
        );
      }
    }

    // Parse specifications if it's a string
    let parsedSpecifications = null;
    if (specifications) {
      try {
        parsedSpecifications =
          typeof specifications === "string"
            ? JSON.parse(specifications)
            : specifications;
      } catch (error) {
        await transaction.rollback();
        return next(new ErrorHandler("Invalid specifications format", 400));
      }
    }

    // Create product
    const product = await Product.create(
      {
        name: name.trim(),
        description: description?.trim() || null,
        images: imagesData.length > 0 ? imagesData : null,
        type: type?.trim() || null,
        vendor: vendor?.trim() || null,
        seo_title: seo_title?.trim() || null,
        seo_description: seo_description?.trim() || null,
        status: status || "draft",
        specifications: parsedSpecifications,
        category_id: category_id || null,
      },
      { transaction }
    );

    await transaction.commit();

    // Fetch the created product with associations
    const productData = await Product.findByPk(product.id, {
      include: [
        {
          model: Category,
          as: "category",
          attributes: ["id", "name", "is_active"],
        },
        {
          model: ProductVariant,
          as: "variants",
          attributes: [
            "id",
            "price",
            "compare_at_price"
          ],
        },
      ],
    });

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: productData,
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get Product by ID
const getProductById = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return next(new ErrorHandler("Product ID is required", 400));
    }

    const product = await Product.findByPk(id, {
      include: [
        {
          model: Category,
          as: "category",
          attributes: ["id", "name", "is_active"],
        },
        {
          model: ProductVariant,
          as: "variants",
          include: [
            {
              model: ProductInventory,
              as: "inventories",
              include: [
                {
                  model: ProductLocation,
                  as: "location",
                  attributes: ["id", "name"],
                },
              ],
            }
          ],
        },
      ],
    });

    if (!product) {
      return next(new ErrorHandler("Product not found", 404));
    }

    return res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get All Products with filters and pagination
const getAllProducts = asyncHandler(async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      category_id,
      vendor,
      type,
      sort_by = "createdAt",
      sort_order = "DESC",
      include_variants = false,
      include_category = true,
    } = req.query;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Max limit of 100
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};

    // Search filter
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search.trim()}%` } },
        { description: { [Op.iLike]: `%${search.trim()}%` } },
        { vendor: { [Op.iLike]: `%${search.trim()}%` } },
        { type: { [Op.iLike]: `%${search.trim()}%` } },
      ];
    }

    // Status filter
    if (status && ["active", "draft", "archived"].includes(status)) {
      whereClause.status = status;
    }

    // Category filter
    if (category_id) {
      whereClause.category_id = category_id;
    }

    // Vendor filter
    if (vendor) {
      whereClause.vendor = { [Op.iLike]: `%${vendor.trim()}%` };
    }

    // Type filter
    if (type) {
      whereClause.type = { [Op.iLike]: `%${type.trim()}%` };
    }

    const includeOptions = [];

    // Include category if requested
    if (include_category === "true") {
      includeOptions.push({
        model: Category,
        as: "category",
        attributes: ["id", "name", "is_active"],
        required: false,
      });
    }

    // Include variants if requested
    if (include_variants === "true") {
      includeOptions.push({
        model: ProductVariant,
        as: "variants",
        required: false,
        attributes: [
          "id",
          "price",
          "compare_at_price",
          "weight",
        ],
      });
    }

    // Validate sort parameters
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "name",
      "status",
      "vendor",
      "type",
    ];
    const sortField = validSortFields.includes(sort_by) ? sort_by : "createdAt";
    const sortDirection = ["ASC", "DESC"].includes(sort_order.toUpperCase())
      ? sort_order.toUpperCase()
      : "DESC";

    const { count, rows: products } = await Product.findAndCountAll({
      where: whereClause,
      include: includeOptions,
      limit: limitNum,
      offset: offset,
      order: [[sortField, sortDirection]],
      distinct: true, // Important when using includes to get correct count
    });

    const totalPages = Math.ceil(count / limitNum);

    return res.status(200).json({
      success: true,
      data: {
        products,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: count,
          itemsPerPage: limitNum,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
        },
      },
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Update Product
const updateProduct = asyncHandler(async (req, res, next) => {
  const transaction = await models.db.sequelize.transaction();

  try {
    const { id } = req.params;
    const {
      name,
      description,
      type,
      vendor,
      seo_title,
      seo_description,
      status,
      specifications,
      category_id,
      remove_images = [], // Array of image filenames to remove
    } = req.body;

    if (!id) {
      await transaction.rollback();
      return next(new ErrorHandler("Product ID is required", 400));
    }

    const product = await Product.findByPk(id, { transaction });
    if (!product) {
      await transaction.rollback();
      return next(new ErrorHandler("Product not found", 404));
    }

    // Validate update data
    const validationErrors = validateProductData({
      name: name || product.name,
      ...req.body,
    });
    const specErrors = validateSpecifications(specifications);

    if (validationErrors.length > 0 || specErrors.length > 0) {
      await transaction.rollback();
      return next(
        new ErrorHandler([...validationErrors, ...specErrors].join(", "), 400)
      );
    }

    // Check if name is being updated and already exists
    if (name && name.trim() !== product.name) {
      const existingProduct = await Product.findOne({
        where: {
          name: name.trim(),
          id: { [Op.ne]: id },
        },
        transaction,
      });

      if (existingProduct) {
        await transaction.rollback();
        return next(
          new ErrorHandler("Product with this name already exists", 409)
        );
      }
    }

    // Validate category if being updated
    if (category_id && category_id !== product.category_id) {
      const category = await Category.findOne({
        where: { id: category_id, is_active: true },
        transaction,
      });

      if (!category) {
        await transaction.rollback();
        return next(new ErrorHandler("Invalid or inactive category", 404));
      }
    }

    // Handle image updates
    let updatedImages = [...(product.images || [])];

    // Remove specified images
    if (remove_images.length > 0) {
      const imagesToRemove = updatedImages.filter((img) =>
        remove_images.includes(img.filename)
      );

      // Delete files from CDN
      for (const img of imagesToRemove) {
        try {
          await deleteFile(img.filename);
        } catch (deleteError) {
          console.warn(
            `Failed to delete image ${img.filename}:`,
            deleteError.message
          );
        }
      }

      // Remove from array
      updatedImages = updatedImages.filter(
        (img) => !remove_images.includes(img.filename)
      );
    }

    // Add new images
    if (req.files && req.files.length > 0) {
      // Check total image limit
      if (updatedImages.length + req.files.length > 10) {
        await transaction.rollback();
        return next(
          new ErrorHandler("Maximum 10 images allowed per product", 400)
        );
      }

      try {
        for (const file of req.files) {
          const uploadResult = await uploadFile(file);
          updatedImages.push({
            url: uploadResult.url,
            filename: uploadResult.filename,
            originalName: uploadResult.originalName,
            size: uploadResult.size,
            mimetype: uploadResult.mimetype,
          });
        }
      } catch (uploadError) {
        await transaction.rollback();
        return next(
          new ErrorHandler(`Image upload failed: ${uploadError.message}`, 500)
        );
      }
    }

    // Parse specifications if provided
    let parsedSpecifications = product.specifications;
    if (specifications !== undefined) {
      if (specifications === null || specifications === "") {
        parsedSpecifications = null;
      } else {
        try {
          parsedSpecifications =
            typeof specifications === "string"
              ? JSON.parse(specifications)
              : specifications;
        } catch (error) {
          await transaction.rollback();
          return next(new ErrorHandler("Invalid specifications format", 400));
        }
      }
    }

    // Prepare update data
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined)
      updateData.description = description?.trim() || null;
    if (type !== undefined) updateData.type = type?.trim() || null;
    if (vendor !== undefined) updateData.vendor = vendor?.trim() || null;
    if (seo_title !== undefined)
      updateData.seo_title = seo_title?.trim() || null;
    if (seo_description !== undefined)
      updateData.seo_description = seo_description?.trim() || null;
    if (status !== undefined) updateData.status = status;
    if (specifications !== undefined)
      updateData.specifications = parsedSpecifications;
    if (category_id !== undefined) updateData.category_id = category_id || null;
    if (updatedImages !== product.images)
      updateData.images = updatedImages.length > 0 ? updatedImages : null;

    await product.update(updateData, { transaction });
    await transaction.commit();

    // Fetch updated product with associations
    const updatedProduct = await Product.findByPk(id, {
      include: [
        {
          model: Category,
          as: "category",
          attributes: ["id", "name", "is_active"],
        },
        {
          model: ProductVariant,
          as: "variants",
          attributes: [
            "id",
            "price",
            "compare_at_price"
          ],
        },
      ],
    });

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: updatedProduct,
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    return next(new ErrorHandler(error.message, 500));
  }
});

// Delete Product
const deleteProduct = asyncHandler(async (req, res, next) => {
  const transaction = await models.db.sequelize.transaction();

  try {
    const { id } = req.params;

    if (!id) {
      await transaction.rollback();
      return next(new ErrorHandler("Product ID is required", 400));
    }

    const product = await Product.findByPk(id, {
      include: [
        {
          model: ProductVariant,
          as: "variants",
          include: [
            {
              model: ProductInventory,
              as: "inventories",
            },
          ],
        },
      ],
      transaction,
    });

    if (!product) {
      await transaction.rollback();
      return next(new ErrorHandler("Product not found", 404));
    }

    // Delete images from CDN before deleting the product
    if (product.images && product.images.length > 0) {
      console.log('Deleting product images from CDN...');
      await deleteMultipleFiles(product.images);
    }

     // Delete associated inventories first (cascade from variants)
        if (product.variants && product.variants.length > 0) {
          for (const variant of product.variants) {
            if (variant.inventories && variant.inventories.length > 0) {
              await ProductInventory.destroy({
                where: { variant_id: variant.id },
                transaction
              });
            }
          }
          
          // Delete product variants
          await ProductVariant.destroy({
            where: { product_id: id },
            transaction
          });
        }

    await product.destroy({ transaction });
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Product and all associated variants, inventories, and images deleted successfully",
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get Products by Category
const getProductsByCategory = asyncHandler(async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const {
      page = 1,
      limit = 10,
      status = "active",
      include_variants = false,
    } = req.query;

    if (!categoryId) {
      return next(new ErrorHandler("Category ID is required", 400));
    }

    // Verify category exists
    const category = await Category.findByPk(categoryId);
    if (!category) {
      return next(new ErrorHandler("Category not found", 404));
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const whereClause = { category_id: categoryId };
    if (status && ["active", "draft", "archived"].includes(status)) {
      whereClause.status = status;
    }

    const includeOptions = [
      {
        model: Category,
        as: "category",
        attributes: ["id", "name", "is_active"],
      },
    ];

    if (include_variants === "true") {
      includeOptions.push({
        model: ProductVariant,
        as: "variants",
        attributes: [
          "id",
          "price",
          "compare_at_price"
        ],
      });
    }

    const { count, rows: products } = await Product.findAndCountAll({
      where: whereClause,
      include: includeOptions,
      limit: limitNum,
      offset: offset,
      order: [["createdAt", "DESC"]],
    });

    const totalPages = Math.ceil(count / limitNum);

    return res.status(200).json({
      success: true,
      data: {
        category: {
          id: category.id,
          name: category.name,
        },
        products,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: count,
          itemsPerPage: limitNum,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
        },
      },
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Bulk update product status
const bulkUpdateProductStatus = asyncHandler(async (req, res, next) => {
  const transaction = await models.db.sequelize.transaction();

  try {
    const { product_ids, status } = req.body;

    if (
      !product_ids ||
      !Array.isArray(product_ids) ||
      product_ids.length === 0
    ) {
      await transaction.rollback();
      return next(new ErrorHandler("Product IDs array is required", 400));
    }

    if (!status || !["active", "draft", "archived"].includes(status)) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          "Valid status is required (active, draft, archived)",
          400
        )
      );
    }

    if (product_ids.length > 100) {
      await transaction.rollback();
      return next(
        new ErrorHandler("Maximum 100 products can be updated at once", 400)
      );
    }

    const [updatedCount] = await Product.update(
      { status },
      {
        where: { id: { [Op.in]: product_ids } },
        transaction,
      }
    );

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `${updatedCount} products updated successfully`,
      data: {
        updated_count: updatedCount,
        status: status,
      },
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

module.exports = {
  createProduct,
  getProductById,
  getAllProducts,
  updateProduct,
  deleteProduct,
  getProductsByCategory,
  bulkUpdateProductStatus,
};
