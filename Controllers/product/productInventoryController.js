const { Op } = require("sequelize");
const models = require("../../Modals/index");
const ErrorHandler = require("../../Utils/errorHandle");
const asyncHandler = require("../../Utils/asyncHandler");
const {
    validateInventoryData,
    validateQuantityLogic
  } = require("../../Validators/InventoryValidation");
const { ProductVariant, ProductInventory, ProductLocation, Product, Category } = models;

// Create Inventory
const createInventory = asyncHandler(async (req, res, next) => {
    const transaction = await models.db.sequelize.transaction();
  
    try {
      const {
        variant_id,
        location_id,
        quantity = 0,
        reservedQuantity = 0,
      } = req.body;
  
      // Validate required fields
      if (!variant_id) {
        await transaction.rollback();
        return next(new ErrorHandler("Product variant ID is required", 400));
      }
  
      if (!location_id) {
        await transaction.rollback();
        return next(new ErrorHandler("Location ID is required", 400));
      }
  
      // Validate input data
      const validationErrors = validateInventoryData(req.body);
      const quantityErrors = validateQuantityLogic(quantity, reservedQuantity);
  
      if (validationErrors.length > 0 || quantityErrors.length > 0) {
        await transaction.rollback();
        return next(
          new ErrorHandler([...validationErrors, ...quantityErrors].join(", "), 400)
        );
      }
  
      // Verify variant exists and is active
      const variant = await ProductVariant.findOne({
        where: { id: variant_id },
        include: [
          {
            model: Product,
            as: "product",
            attributes: ["id", "name", "status"],
          },
        ],
        transaction,
      });
  
      if (!variant) {
        await transaction.rollback();
        return next(new ErrorHandler("Product variant not found", 404));
      }
  
      if (variant.product && variant.product.status === "archived") {
        await transaction.rollback();
        return next(new ErrorHandler("Cannot create inventory for archived product", 400));
      }
  
      // Verify location exists and is active
      const location = await ProductLocation.findOne({
        where: { id: location_id },
        transaction,
      });
  
      if (!location) {
        await transaction.rollback();
        return next(new ErrorHandler("Location not found", 404));
      }
  
      // Check if inventory already exists for this variant-location combination
      const existingInventory = await ProductInventory.findOne({
        where: {
          variant_id,
          location_id,
        },
        transaction,
      });
  
      if (existingInventory) {
        await transaction.rollback();
        return next(
          new ErrorHandler(
            "Inventory already exists for this variant-location combination. Use update instead.",
            409
          )
        );
      }
  
      // Create inventory record
      const inventory = await ProductInventory.create(
        {
          variant_id,
          location_id,
          quantity,
          reservedQuantity,
        },
        { transaction }
      );
  
      await transaction.commit();
  
      // Fetch created inventory with associations
      const inventoryData = await ProductInventory.findByPk(inventory.id, {
        include: [
          {
            model: ProductVariant,
            as: "variant",
            attributes: ["id", "price", "compare_at_price", "weight"],
            include: [
              {
                model: Product,
                as: "product",
                attributes: ["id", "name", "status"],
              },
            ],
          },
          {
            model: ProductLocation,
            as: "location",
            attributes: ["id", "name"],
          },
        ],
      });
  
      return res.status(201).json({
        success: true,
        message: "Inventory created successfully",
        data: inventoryData,
      });
    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      return next(new ErrorHandler(error.message, 500));
    }
  });
  
  // Get Inventory by ID
  const getInventoryById = asyncHandler(async (req, res, next) => {
    try {
      const { id } = req.params;
  
      if (!id) {
        return next(new ErrorHandler("Inventory ID is required", 400));
      }
  
      const inventory = await ProductInventory.findByPk(id, {
        include: [
          {
            model: ProductVariant,
            as: "variant",
            attributes: ["id", "price", "compare_at_price", "weight"],
            include: [
              {
                model: Product,
                as: "product",
                attributes: ["id", "name", "status", "type", "vendor"],
                include: [
                  {
                    model: Category,
                    as: "category",
                    attributes: ["id", "name"],
                  },
                ],
              },
            ],
          },
          {
            model: ProductLocation,
            as: "location",
            attributes: ["id", "name"],
          },
        ],
      });
  
      if (!inventory) {
        return next(new ErrorHandler("Inventory not found", 404));
      }
  
      return res.status(200).json({
        success: true,
        data: inventory,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  });
  
  // Get All Inventories with filters and pagination
  const getAllInventories = asyncHandler(async (req, res, next) => {
    try {
      const {
        page = 1,
        limit = 10,
        variant_id,
        location_id,
        product_id,
        low_stock_threshold,
        include_variant = true,
        include_location = true,
        sort_by = "createdAt",
        sort_order = "DESC",
        search,
      } = req.query;
  
      // Validate pagination parameters
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;
  
      const whereClause = {};
      const includeOptions = [];
  
      // Filter by variant
      if (variant_id) {
        whereClause.variant_id = variant_id;
      }
  
      // Filter by location
      if (location_id) {
        whereClause.location_id = location_id;
      }
  
      // Low stock filter
      if (low_stock_threshold) {
        const threshold = parseInt(low_stock_threshold);
        if (!isNaN(threshold)) {
          whereClause.quantity = { [Op.lte]: threshold };
        }
      }
  
      // Include variant information
      if (include_variant === "true") {
        const variantInclude = {
          model: ProductVariant,
          as: "variant",
          attributes: ["id", "price", "compare_at_price", "weight","attributes","barcode"],
          include: [
            {
              model: Product,
              as: "product",
              attributes: ["id", "name", "status", "type", "vendor"],
              include: [
                {
                  model: Category,
                  as: "category",
                  attributes: ["id", "name"],
                },
              ],
            },
          ],
        };
  
        // Filter by product if specified
        if (product_id) {
          variantInclude.include[0].where = { id: product_id };
          variantInclude.required = true;
        }
  
        // Search functionality
        if (search) {
          variantInclude.include[0].where = {
            ...variantInclude.include[0].where,
            [Op.or]: [
              { name: { [Op.iLike]: `%${search.trim()}%` } },
              { vendor: { [Op.iLike]: `%${search.trim()}%` } },
              { type: { [Op.iLike]: `%${search.trim()}%` } },
            ],
          };
          variantInclude.required = true;
        }
  
        includeOptions.push(variantInclude);
      }
  
      // Include location information
      if (include_location === "true") {
        includeOptions.push({
          model: ProductLocation,
          as: "location",
          attributes: ["id", "name"],
        });
      }
  
      // Validate sort parameters
      const validSortFields = [
        "createdAt",
        "updatedAt",
        "quantity",
        "reservedQuantity",
      ];
      const sortField = validSortFields.includes(sort_by) ? sort_by : "createdAt";
      const sortDirection = ["ASC", "DESC"].includes(sort_order.toUpperCase())
        ? sort_order.toUpperCase()
        : "DESC";
  
      const { count, rows: inventories } = await ProductInventory.findAndCountAll({
        where: whereClause,
        include: includeOptions,
        limit: limitNum,
        offset: offset,
        order: [[sortField, sortDirection]],
        distinct: true,
      });
  
      const totalPages = Math.ceil(count / limitNum);
  
      // Calculate summary statistics
      const summaryStats = await ProductInventory.findOne({
        attributes: [
          [models.db.sequelize.fn('SUM', models.db.sequelize.col('quantity')), 'totalQuantity'],
          [models.db.sequelize.fn('SUM', models.db.sequelize.col('reservedQuantity')), 'totalReserved'],
          [models.db.sequelize.fn('COUNT', models.db.sequelize.col('id')), 'totalRecords'],
        ],
        where: whereClause,
        raw: true,
      });
  
      return res.status(200).json({
        success: true,
        data: {
          inventories,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalItems: count,
            itemsPerPage: limitNum,
            hasNextPage: pageNum < totalPages,
            hasPrevPage: pageNum > 1,
          },
          summary: {
            totalQuantity: parseInt(summaryStats.totalQuantity) || 0,
            totalReserved: parseInt(summaryStats.totalReserved) || 0,
            availableQuantity: (parseInt(summaryStats.totalQuantity) || 0) - (parseInt(summaryStats.totalReserved) || 0),
            totalRecords: parseInt(summaryStats.totalRecords) || 0,
          },
        },
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  });
  
  // Update Inventory
  const updateInventory = asyncHandler(async (req, res, next) => {
    const transaction = await models.db.sequelize.transaction();
  
    try {
      const { id } = req.params;
      const { quantity, reservedQuantity, location_id } = req.body;
  
      if (!id) {
        await transaction.rollback();
        return next(new ErrorHandler("Inventory ID is required", 400));
      }
  
      const inventory = await ProductInventory.findByPk(id, { transaction });
      if (!inventory) {
        await transaction.rollback();
        return next(new ErrorHandler("Inventory not found", 404));
      }
  
      // Validate update data
      const validationErrors = validateInventoryData(req.body);
  
      // Determine final quantities for validation
      const finalQuantity = quantity !== undefined ? quantity : inventory.quantity;
      const finalReservedQuantity = reservedQuantity !== undefined ? reservedQuantity : inventory.reservedQuantity;
      
      const quantityErrors = validateQuantityLogic(finalQuantity, finalReservedQuantity);
  
      if (validationErrors.length > 0 || quantityErrors.length > 0) {
        await transaction.rollback();
        return next(
          new ErrorHandler([...validationErrors, ...quantityErrors].join(", "), 400)
        );
      }
  
      // If location is being updated, verify it exists
      if (location_id && location_id !== inventory.location_id) {
        const location = await ProductLocation.findByPk(location_id, { transaction });
        if (!location) {
          await transaction.rollback();
          return next(new ErrorHandler("Location not found", 404));
        }
  
        // Check if inventory already exists for new location
        const existingInventory = await ProductInventory.findOne({
          where: {
            variant_id: inventory.variant_id,
            location_id: location_id,
            id: { [Op.ne]: id },
          },
          transaction,
        });
  
        if (existingInventory) {
          await transaction.rollback();
          return next(
            new ErrorHandler(
              "Inventory already exists for this variant-location combination",
              409
            )
          );
        }
      }
  
      // Prepare update data
      const updateData = {};
      if (quantity !== undefined) updateData.quantity = quantity;
      if (reservedQuantity !== undefined) updateData.reservedQuantity = reservedQuantity;
      if (location_id !== undefined) updateData.location_id = location_id;
  
      await inventory.update(updateData, { transaction });
      await transaction.commit();
  
      // Fetch updated inventory with associations
      const updatedInventory = await ProductInventory.findByPk(id, {
        include: [
          {
            model: ProductVariant,
            as: "variant",
            attributes: ["id", "price", "compare_at_price", "weight"],
            include: [
              {
                model: Product,
                as: "product",
                attributes: ["id", "name", "status"],
              },
            ],
          },
          {
            model: ProductLocation,
            as: "location",
            attributes: ["id", "name"],
          },
        ],
      });
  
      return res.status(200).json({
        success: true,
        message: "Inventory updated successfully",
        data: updatedInventory,
      });
    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      return next(new ErrorHandler(error.message, 500));
    }
  });
  
  // Delete Inventory
  const deleteInventory = asyncHandler(async (req, res, next) => {
    const transaction = await models.db.sequelize.transaction();
  
    try {
      const { id } = req.params;
      const { force = false } = req.query;
  
      if (!id) {
        await transaction.rollback();
        return next(new ErrorHandler("Inventory ID is required", 400));
      }
  
      const inventory = await ProductInventory.findByPk(id, { transaction });
      if (!inventory) {
        await transaction.rollback();
        return next(new ErrorHandler("Inventory not found", 404));
      }
  
      // Check if inventory has reserved quantity
      if (inventory.reservedQuantity > 0 && !force) {
        await transaction.rollback();
        return res.status(409).json({
          success: false,
          message: "Cannot delete inventory with reserved quantity. Use force=true to proceed.",
          data: {
            reservedQuantity: inventory.reservedQuantity,
            totalQuantity: inventory.quantity,
          },
        });
      }
  
      // Check if inventory has available quantity
      if (inventory.quantity > 0 && !force) {
        await transaction.rollback();
        return res.status(409).json({
          success: false,
          message: "Cannot delete inventory with available quantity. Use force=true to proceed.",
          data: {
            availableQuantity: inventory.quantity - inventory.reservedQuantity,
            totalQuantity: inventory.quantity,
          },
        });
      }
  
      await inventory.destroy({ transaction });
      await transaction.commit();
  
      return res.status(200).json({
        success: true,
        message: "Inventory deleted successfully",
      });
    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      return next(new ErrorHandler(error.message, 500));
    }
  });
  
  // Bulk update inventory quantities
  const bulkUpdateInventory = asyncHandler(async (req, res, next) => {
    const transaction = await models.db.sequelize.transaction();
  
    try {
      const { updates } = req.body;
  
      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        await transaction.rollback();
        return next(new ErrorHandler("Updates array is required", 400));
      }
  
      if (updates.length > 100) {
        await transaction.rollback();
        return next(
          new ErrorHandler("Maximum 100 inventory records can be updated at once", 400)
        );
      }
  
      const results = [];
      const errors = [];
  
      for (const update of updates) {
        try {
          const { id, quantity, reservedQuantity } = update;
  
          if (!id) {
            errors.push({ id: null, error: "Inventory ID is required" });
            continue;
          }
  
          const inventory = await ProductInventory.findByPk(id, { transaction });
          if (!inventory) {
            errors.push({ id, error: "Inventory not found" });
            continue;
          }
  
          // Validate quantities
          const validationErrors = validateInventoryData(update);
          const finalQuantity = quantity !== undefined ? quantity : inventory.quantity;
          const finalReservedQuantity = reservedQuantity !== undefined ? reservedQuantity : inventory.reservedQuantity;
          const quantityErrors = validateQuantityLogic(finalQuantity, finalReservedQuantity);
  
          if (validationErrors.length > 0 || quantityErrors.length > 0) {
            errors.push({
              id,
              error: [...validationErrors, ...quantityErrors].join(", "),
            });
            continue;
          }
  
          const updateData = {};
          if (quantity !== undefined) updateData.quantity = quantity;
          if (reservedQuantity !== undefined) updateData.reservedQuantity = reservedQuantity;
  
          await inventory.update(updateData, { transaction });
          results.push({ id, status: "updated" });
        } catch (error) {
          errors.push({ id: update.id, error: error.message });
        }
      }
  
      if (errors.length > 0 && results.length === 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "All updates failed",
          errors,
        });
      }
  
      await transaction.commit();
  
      return res.status(200).json({
        success: true,
        message: `${results.length} inventory records updated successfully`,
        data: {
          successful_updates: results.length,
          failed_updates: errors.length,
          results,
          errors: errors.length > 0 ? errors : undefined,
        },
      });
    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      return next(new ErrorHandler(error.message, 500));
    }
  });
  
  // Get low stock inventories
  const getLowStockInventories = asyncHandler(async (req, res, next) => {
    try {
      const { threshold = 10, location_id } = req.query;
  
      const whereClause = {
        quantity: { [Op.lte]: parseInt(threshold) },
      };
  
      if (location_id) {
        whereClause.location_id = location_id;
      }
  
      const lowStockInventories = await ProductInventory.findAll({
        where: whereClause,
        include: [
          {
            model: ProductVariant,
            as: "variant",
            attributes: ["id", "price", "compare_at_price"],
            include: [
              {
                model: Product,
                as: "product",
                attributes: ["id", "name", "status", "vendor"],
              },
            ],
          },
          {
            model: ProductLocation,
            as: "location",
            attributes: ["id", "name"],
          },
        ],
        order: [["quantity", "ASC"]],
      });
  
      return res.status(200).json({
        success: true,
        data: {
          threshold: parseInt(threshold),
          count: lowStockInventories.length,
          inventories: lowStockInventories,
        },
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  });
  
  // Reserve inventory quantity
  const reserveInventory = asyncHandler(async (req, res, next) => {
    const transaction = await models.db.sequelize.transaction();
  
    try {
      const { id } = req.params;
      const { reserveQuantity } = req.body;
  
      if (!id) {
        await transaction.rollback();
        return next(new ErrorHandler("Inventory ID is required", 400));
      }
  
      if (!reserveQuantity || reserveQuantity <= 0) {
        await transaction.rollback();
        return next(new ErrorHandler("Reserve quantity must be positive", 400));
      }
  
      const inventory = await ProductInventory.findByPk(id, { transaction });
      if (!inventory) {
        await transaction.rollback();
        return next(new ErrorHandler("Inventory not found", 404));
      }
  
      const availableQuantity = inventory.quantity - inventory.reservedQuantity;
      
      if (reserveQuantity > availableQuantity) {
        await transaction.rollback();
        return next(
          new ErrorHandler(
            `Insufficient available quantity. Available: ${availableQuantity}, Requested: ${reserveQuantity}`,
            400
          )
        );
      }
  
      await inventory.update(
        { reservedQuantity: inventory.reservedQuantity + reserveQuantity },
        { transaction }
      );
  
      await transaction.commit();
  
      return res.status(200).json({
        success: true,
        message: "Inventory reserved successfully",
        data: {
          reserved_quantity: reserveQuantity,
          new_reserved_total: inventory.reservedQuantity + reserveQuantity,
          available_quantity: availableQuantity - reserveQuantity,
        },
      });
    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      return next(new ErrorHandler(error.message, 500));
    }
  });
  
  // Release reserved inventory
  const releaseReservedInventory = asyncHandler(async (req, res, next) => {
    const transaction = await models.db.sequelize.transaction();
  
    try {
      const { id } = req.params;
      const { releaseQuantity } = req.body;
  
      if (!id) {
        await transaction.rollback();
        return next(new ErrorHandler("Inventory ID is required", 400));
      }
  
      if (!releaseQuantity || releaseQuantity <= 0) {
        await transaction.rollback();
        return next(new ErrorHandler("Release quantity must be positive", 400));
      }
  
      const inventory = await ProductInventory.findByPk(id, { transaction });
      if (!inventory) {
        await transaction.rollback();
        return next(new ErrorHandler("Inventory not found", 404));
      }
  
      if (releaseQuantity > inventory.reservedQuantity) {
        await transaction.rollback();
        return next(
          new ErrorHandler(
            `Cannot release more than reserved. Reserved: ${inventory.reservedQuantity}, Requested: ${releaseQuantity}`,
            400
          )
        );
      }
  
      await inventory.update(
        { reservedQuantity: inventory.reservedQuantity - releaseQuantity },
        { transaction }
      );
  
      await transaction.commit();
  
      return res.status(200).json({
        success: true,
        message: "Reserved inventory released successfully",
        data: {
          released_quantity: releaseQuantity,
          new_reserved_total: inventory.reservedQuantity - releaseQuantity,
          available_quantity: inventory.quantity - (inventory.reservedQuantity - releaseQuantity),
        },
      });
    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      return next(new ErrorHandler(error.message, 500));
    }
  });
  
  module.exports = {
    createInventory,
    getInventoryById,
    getAllInventories,
    updateInventory,
    deleteInventory,
    bulkUpdateInventory,
    getLowStockInventories,
    reserveInventory,
    releaseReservedInventory,
  };