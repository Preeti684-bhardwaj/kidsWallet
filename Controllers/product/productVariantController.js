const { Op } = require("sequelize");
const models = require("../../Modals/index");
const { uploadFile, deleteFile } = require("../../Utils/cdnImplementation");
const ErrorHandler = require("../../Utils/errorHandle");
const asyncHandler = require("../../Utils/asyncHandler");
const {
  validateVariantData,
  validateBarcodeUniqueness,
} = require("../../Validators/productVariantValidation");
const { Product, ProductVariant, ProductInventory, ProductLocation } = models;

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

// Create Product Variant
const createProductVariant = asyncHandler(async (req, res, next) => {
  const transaction = await models.db.sequelize.transaction();
  try {
    const {
      product_id,
      barcode,
      price,
      compare_at_price,
      weight,
      weight_unit = "g",
      requires_shipping = true,
      origin_country,
      is_taxable = true,
      attributes,
      is_active = true,
      max_quantity_per_order = 100,
    } = req.body;

    // Validate required fields
    if (!product_id) {
      await transaction.rollback();
      return next(new ErrorHandler("Product ID is required", 400));
    }

    // Verify product exists
    const product = await Product.findByPk(product_id, { transaction });
    if (!product) {
      await transaction.rollback();
      return next(new ErrorHandler("Product not found", 404));
    }

    // Validate variant data
    if (typeof req.body.attributes === "string") {
      try {
        req.body.attributes = JSON.parse(req.body.attributes);
      } catch (e) {
        await transaction.rollback();
        return next(new ErrorHandler("Invalid JSON format in attributes", 400));
      }
    }

    // Validate variant data
    const validationErrors = validateVariantData(req.body);
    if (validationErrors.length > 0) {
      await transaction.rollback();
      return next(new ErrorHandler(validationErrors.join(", "), 400));
    }

    // Check barcode uniqueness if provided
    if (barcode) {
      const isBarcodeUnique = await validateBarcodeUniqueness(
        barcode,
        null,
        transaction
      );
      if (!isBarcodeUnique) {
        await transaction.rollback();
        return next(new ErrorHandler("Barcode already exists", 409));
      }
    }

    // Check for duplicate variant attributes within the same product
    const existingVariants = await ProductVariant.findAll({
      where: { product_id },
      transaction,
    });

    const parsedAttributes =
      typeof attributes === "string" ? JSON.parse(attributes) : attributes;

    // Sort attributes for comparison
    const sortedNewAttrs = parsedAttributes
      .map((attr) => `${attr.name}:${attr.value}`)
      .sort()
      .join("|");

    for (const variant of existingVariants) {
      if (variant.attributes && Array.isArray(variant.attributes)) {
        const sortedExistingAttrs = variant.attributes
          .map((attr) => `${attr.name}:${attr.value}`)
          .sort()
          .join("|");

        if (sortedNewAttrs === sortedExistingAttrs) {
          await transaction.rollback();
          return next(
            new ErrorHandler(
              "A variant with these attributes already exists for this product",
              409
            )
          );
        }
      }
    }

    // Handle image uploads
    let imagesData = [];
    if (req.files && req.files.length > 0) {
      if (req.files.length > 10) {
        await transaction.rollback();
        return next(
          new ErrorHandler("Maximum 10 images allowed per variant", 400)
        );
      }

      try {
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

    // Create variant
    const variant = await ProductVariant.create(
      {
        product_id,
        images: imagesData.length > 0 ? imagesData : null,
        barcode: barcode?.trim() || null,
        price: parseFloat(price),
        compare_at_price: compare_at_price
          ? parseFloat(compare_at_price)
          : null,
        weight: weight ? parseFloat(weight) : null,
        weight_unit,
        requires_shipping: Boolean(requires_shipping),
        origin_country: origin_country?.trim() || null,
        is_taxable: Boolean(is_taxable),
        attributes: parsedAttributes,
        is_active: Boolean(is_active),
        max_quantity_per_order: parseInt(max_quantity_per_order),
      },
      { transaction }
    );

    await transaction.commit();

    // Fetch created variant with associations
    const variantData = await ProductVariant.findByPk(variant.id, {
      include: [
        {
          model: Product,
          as: "product",
          attributes: ["id", "name", "status"],
        },
      ],
    });

    return res.status(201).json({
      success: true,
      message: "Product variant created successfully",
      data: variantData,
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get Product Variant by ID
const getProductVariantById = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return next(new ErrorHandler("Variant ID is required", 400));
    }

    const variant = await ProductVariant.findByPk(id, {
      include: [
        {
          model: Product,
          as: "product",
          attributes: ["id", "name", "status", "category_id"],
        },
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
        },
      ],
    });

    if (!variant) {
      return next(new ErrorHandler("Product variant not found", 404));
    }

    return res.status(200).json({
      success: true,
      data: variant,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get All Product Variants with filters and pagination
const getAllProductVariants = asyncHandler(async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      product_id,
      is_active,
      barcode,
      price_min,
      price_max,
      sort_by = "createdAt",
      sort_order = "DESC",
      include_product = true,
      include_inventory = false,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};

    // Filters
    if (product_id) {
      whereClause.product_id = product_id;
    }

    if (is_active !== undefined) {
      whereClause.is_active = is_active === "true";
    }

    if (barcode) {
      whereClause.barcode = { [Op.iLike]: `%${barcode.trim()}%` };
    }

    if (price_min || price_max) {
      whereClause.price = {};
      if (price_min) whereClause.price[Op.gte] = parseFloat(price_min);
      if (price_max) whereClause.price[Op.lte] = parseFloat(price_max);
    }

    const includeOptions = [];

    if (include_product === "true") {
      includeOptions.push({
        model: Product,
        as: "product",
        attributes: ["id", "name", "status", "category_id"],
      });
    }

    if (include_inventory === "true") {
      includeOptions.push({
        model: ProductInventory,
        as: "inventories",
        include: [
          {
            model: ProductLocation,
            as: "location",
            attributes: ["id", "name"],
          },
        ],
      });
    }

    const validSortFields = ["createdAt", "updatedAt", "price", "barcode"];
    const sortField = validSortFields.includes(sort_by) ? sort_by : "createdAt";
    const sortDirection = ["ASC", "DESC"].includes(sort_order.toUpperCase())
      ? sort_order.toUpperCase()
      : "DESC";

    const { count, rows: variants } = await ProductVariant.findAndCountAll({
      where: whereClause,
      include: includeOptions,
      limit: limitNum,
      offset: offset,
      order: [[sortField, sortDirection]],
      distinct: true,
    });

    const totalPages = Math.ceil(count / limitNum);

    return res.status(200).json({
      success: true,
      data: {
        variants,
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

// Update Product Variant
const updateProductVariant = asyncHandler(async (req, res, next) => {
  const transaction = await models.db.sequelize.transaction();

  try {
    const { id } = req.params;
    const {
      barcode,
      price,
      compare_at_price,
      weight,
      weight_unit,
      requires_shipping,
      origin_country,
      is_taxable,
      attributes,
      is_active,
      max_quantity_per_order,
      remove_images = [],
    } = req.body;

    if (!id) {
      await transaction.rollback();
      return next(new ErrorHandler("Variant ID is required", 400));
    }

    const variant = await ProductVariant.findByPk(id, { transaction });
    if (!variant) {
      await transaction.rollback();
      return next(new ErrorHandler("Product variant not found", 404));
    }

    // Safely parse attributes before validation
    let parsedAttributes = attributes;
    if (attributes !== undefined && typeof attributes === "string") {
      try {
        parsedAttributes = JSON.parse(attributes);
      } catch (err) {
        await transaction.rollback();
        return next(new ErrorHandler("Invalid JSON format in attributes", 400));
      }
    }

    const updateData = {
      ...req.body,
      attributes: parsedAttributes,
    };

    if (price !== undefined) updateData.price = price;

    const validationErrors = validateVariantData({
      ...variant.dataValues,
      ...updateData,
    });

    if (validationErrors.length > 0) {
      await transaction.rollback();
      return next(new ErrorHandler(validationErrors.join(", "), 400));
    }

    // Check barcode uniqueness if being updated
    if (barcode && barcode !== variant.barcode) {
      const isBarcodeUnique = await validateBarcodeUniqueness(
        barcode,
        id,
        transaction
      );
      if (!isBarcodeUnique) {
        await transaction.rollback();
        return next(new ErrorHandler("Barcode already exists", 409));
      }
    }

    // Check for duplicate attributes if being updated
    if (attributes) {
      const parsedAttributes =
        typeof attributes === "string" ? JSON.parse(attributes) : attributes;

      const existingVariants = await ProductVariant.findAll({
        where: {
          product_id: variant.product_id,
          id: { [Op.ne]: id },
        },
        transaction,
      });

      const sortedNewAttrs = parsedAttributes
        .map((attr) => `${attr.name}:${attr.value}`)
        .sort()
        .join("|");

      for (const existingVariant of existingVariants) {
        if (
          existingVariant.attributes &&
          Array.isArray(existingVariant.attributes)
        ) {
          const sortedExistingAttrs = existingVariant.attributes
            .map((attr) => `${attr.name}:${attr.value}`)
            .sort()
            .join("|");

          if (sortedNewAttrs === sortedExistingAttrs) {
            await transaction.rollback();
            return next(
              new ErrorHandler(
                "A variant with these attributes already exists for this product",
                409
              )
            );
          }
        }
      }
    }

    // Handle image updates
    let updatedImages = [...(variant.images || [])];

    // Remove specified images
    if (remove_images.length > 0) {
      const imagesToRemove = updatedImages.filter((img) =>
        remove_images.includes(img.filename)
      );

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

      updatedImages = updatedImages.filter(
        (img) => !remove_images.includes(img.filename)
      );
    }

    // Add new images
    if (req.files && req.files.length > 0) {
      if (updatedImages.length + req.files.length > 10) {
        await transaction.rollback();
        return next(
          new ErrorHandler("Maximum 10 images allowed per variant", 400)
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

    // Prepare update data
    const finalUpdateData = {};
    if (barcode !== undefined)
      finalUpdateData.barcode = barcode?.trim() || null;
    if (price !== undefined) finalUpdateData.price = parseFloat(price);
    if (compare_at_price !== undefined)
      finalUpdateData.compare_at_price = compare_at_price
        ? parseFloat(compare_at_price)
        : null;
    if (weight !== undefined)
      finalUpdateData.weight = weight ? parseFloat(weight) : null;
    if (weight_unit !== undefined) finalUpdateData.weight_unit = weight_unit;
    if (requires_shipping !== undefined)
      finalUpdateData.requires_shipping = Boolean(requires_shipping);
    if (origin_country !== undefined)
      finalUpdateData.origin_country = origin_country?.trim() || null;
    if (is_taxable !== undefined)
      finalUpdateData.is_taxable = Boolean(is_taxable);
    if (attributes !== undefined) {
      finalUpdateData.attributes =
        typeof attributes === "string" ? JSON.parse(attributes) : attributes;
    }
    if (is_active !== undefined) finalUpdateData.is_active = Boolean(is_active);
    if (max_quantity_per_order !== undefined)
      finalUpdateData.max_quantity_per_order = parseInt(max_quantity_per_order);
    if (updatedImages !== variant.images)
      finalUpdateData.images = updatedImages.length > 0 ? updatedImages : null;

    await variant.update(finalUpdateData, { transaction });
    await transaction.commit();

    // Fetch updated variant with associations
    const updatedVariant = await ProductVariant.findByPk(id, {
      include: [
        {
          model: Product,
          as: "product",
          attributes: ["id", "name", "status"],
        },
      ],
    });

    return res.status(200).json({
      success: true,
      message: "Product variant updated successfully",
      data: updatedVariant,
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    return next(new ErrorHandler(error.message, 500));
  }
});

// Delete Product Variant
const deleteProductVariant = asyncHandler(async (req, res, next) => {
  const transaction = await models.db.sequelize.transaction();

  try {
    const { id } = req.params;

    if (!id) {
      await transaction.rollback();
      return next(new ErrorHandler("Variant ID is required", 400));
    }

    const variant = await ProductVariant.findByPk(id, {
      attributes: ['id', 'images'],
      include: [
        {
          model: ProductInventory,
          as: "inventories",
        },
      ],
      transaction,
    });

    if (!variant) {
      await transaction.rollback();
      return next(new ErrorHandler("Product variant not found", 404));
    }

       // Count images for the response message
       const imageCount = variant.images ? variant.images.length : 0;
    
       // Delete images from CDN before deleting the variant
       if (variant.images && variant.images.length > 0) {
         console.log('Deleting variant images from CDN...');
         await deleteMultipleFiles(variant.images);
       }
   
    await variant.destroy({ transaction });
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `Variant deleted successfully. ${imageCount} images deleted from CDN.`,
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get Variants by Product ID
const getVariantsByProduct = asyncHandler(async (req, res, next) => {
  try {
    const { productId } = req.params;
    const {
      is_active,
      include_inventory = false,
      sort_by = "createdAt",
      sort_order = "DESC",
    } = req.query;

    if (!productId) {
      return next(new ErrorHandler("Product ID is required", 400));
    }

    // Verify product exists
    const product = await Product.findByPk(productId);
    if (!product) {
      return next(new ErrorHandler("Product not found", 404));
    }

    const whereClause = { product_id: productId };
    if (is_active !== undefined) {
      whereClause.is_active = is_active === "true";
    }

    const includeOptions = [
      {
        model: Product,
        as: "product",
        attributes: ["id", "name", "status"],
      },
    ];

    if (include_inventory === "true") {
      includeOptions.push({
        model: ProductInventory,
        as: "inventories",
        include: [
          {
            model: ProductLocation,
            as: "location",
            attributes: ["id", "name"],
          },
        ],
      });
    }

    const validSortFields = ["createdAt", "updatedAt", "price"];
    const sortField = validSortFields.includes(sort_by) ? sort_by : "createdAt";
    const sortDirection = ["ASC", "DESC"].includes(sort_order.toUpperCase())
      ? sort_order.toUpperCase()
      : "DESC";

    const variants = await ProductVariant.findAll({
      where: whereClause,
      include: includeOptions,
      order: [[sortField, sortDirection]],
    });

    return res.status(200).json({
      success: true,
      data: {
        product: {
          id: product.id,
          name: product.name,
        },
        variants,
        total: variants.length,
      },
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Bulk update variant status
const bulkUpdateVariantStatus = asyncHandler(async (req, res, next) => {
  const transaction = await models.db.sequelize.transaction();

  try {
    const { variant_ids, is_active } = req.body;

    if (
      !variant_ids ||
      !Array.isArray(variant_ids) ||
      variant_ids.length === 0
    ) {
      await transaction.rollback();
      return next(new ErrorHandler("Variant IDs array is required", 400));
    }

    if (typeof is_active !== "boolean") {
      await transaction.rollback();
      return next(new ErrorHandler("is_active must be a boolean value", 400));
    }

    if (variant_ids.length > 100) {
      await transaction.rollback();
      return next(
        new ErrorHandler("Maximum 100 variants can be updated at once", 400)
      );
    }

    const [updatedCount] = await ProductVariant.update(
      { is_active },
      {
        where: { id: { [Op.in]: variant_ids } },
        transaction,
      }
    );

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `${updatedCount} variants updated successfully`,
      data: {
        updated_count: updatedCount,
        is_active: is_active,
      },
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get variant statistics
const getVariantStats = asyncHandler(async (req, res, next) => {
  try {
    const { product_id } = req.query;

    const baseWhere = product_id ? { product_id } : {};

    const stats = await ProductVariant.findAll({
      attributes: [
        [
          models.db.sequelize.fn("COUNT", models.db.sequelize.col("id")),
          "total_variants",
        ],
        [
          models.db.sequelize.fn(
            "COUNT",
            models.db.sequelize.literal("CASE WHEN is_active = true THEN 1 END")
          ),
          "active_variants",
        ],
        [
          models.db.sequelize.fn(
            "COUNT",
            models.db.sequelize.literal(
              "CASE WHEN is_active = false THEN 1 END"
            )
          ),
          "inactive_variants",
        ],
        [
          models.db.sequelize.fn("AVG", models.db.sequelize.col("price")),
          "average_price",
        ],
        [
          models.db.sequelize.fn("MIN", models.db.sequelize.col("price")),
          "min_price",
        ],
        [
          models.db.sequelize.fn("MAX", models.db.sequelize.col("price")),
          "max_price",
        ],
      ],
      where: baseWhere,
      raw: true,
    });

    return res.status(200).json({
      success: true,
      data: stats[0],
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

module.exports = {
  createProductVariant,
  getProductVariantById,
  getAllProductVariants,
  updateProductVariant,
  deleteProductVariant,
  getVariantsByProduct,
  bulkUpdateVariantStatus,
  getVariantStats,
};
