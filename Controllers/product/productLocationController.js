const { Op } = require("sequelize");
const models = require("../../Modals/index");
const ErrorHandler = require("../../Utils/errorHandle");
const asyncHandler = require("../../Utils/asyncHandler");
const{validatePhoneNumber,validatePincode,sanitizeLocationData} = require("../../Validators/locationValidation.js");
const { ProductLocation} = models;

const createInventoryLocation = asyncHandler(async (req, res, next) => {
  const transaction = await models.db.sequelize.transaction();
  
  try {
    const { name, address, pincode, city, state, country, phone, is_active } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      await transaction.rollback();
      return next(new ErrorHandler("Location name is required", 400));
    }

    // Sanitize input data
    const sanitizedData = sanitizeLocationData({
      name, address, pincode, city, state, country, phone, is_active
    });

    // Additional business validations
    if (sanitizedData.name.length < 1 || sanitizedData.name.length > 100) {
      await transaction.rollback();
      return next(new ErrorHandler("Location name must be between 1 and 100 characters", 400));
    }

    if (sanitizedData.phone && !validatePhoneNumber(sanitizedData.phone)) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid phone number format. Only digits, spaces, +, -, and parentheses are allowed", 400));
    }

    if (sanitizedData.pincode && !validatePincode(sanitizedData.pincode)) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid pincode format", 400));
    }

    // Check for duplicate location names
    const existingLocation = await ProductLocation.findOne({
      where: { 
        name: { [Op.iLike]: sanitizedData.name.toLowerCase() }
      },
      transaction,
    });

    if (existingLocation) {
      await transaction.rollback();
      return next(new ErrorHandler("A location with this name already exists", 409));
    }

    // Create inventory location
    const inventoryLocation = await ProductLocation.create({
      name: sanitizedData.name,
      address: sanitizedData.address,
      pincode: sanitizedData.pincode,
      city: sanitizedData.city,
      state: sanitizedData.state,
      country: sanitizedData.country || 'India',
      phone: sanitizedData.phone,
      is_active: sanitizedData.is_active ?? true,
    }, { transaction });

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: "Inventory location created successfully",
      data: inventoryLocation,
    });
  } catch (error) {
    await transaction.rollback();
    
    // Handle Sequelize validation errors
    if (error.name === 'SequelizeValidationError') {
      const validationErrors = error.errors.map(err => err.message);
      return next(new ErrorHandler(validationErrors.join(', '), 400));
    }
    
    return next(new ErrorHandler(error.message, 500));
  }
});

const getInventoryLocationById = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return next(new ErrorHandler("Location ID is required", 400));
    }

    const inventoryLocation = await ProductLocation.findByPk(id);

    if (!inventoryLocation) {
      return next(new ErrorHandler("Inventory location not found", 404));
    }

    return res.status(200).json({
      success: true,
      data: inventoryLocation,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

const getAllInventoryLocations = asyncHandler(async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      is_active,
      city,
      state,
      country,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(Math.max(1, parseInt(limit)), 100); // Max 100 items per page
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};

    // Search filter (searches in name, address, city, state)
    if (search && search.trim()) {
      const searchTerm = search.trim();
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${searchTerm}%` } },
        { address: { [Op.iLike]: `%${searchTerm}%` } },
        { city: { [Op.iLike]: `%${searchTerm}%` } },
        { state: { [Op.iLike]: `%${searchTerm}%` } },
        { pincode: { [Op.iLike]: `%${searchTerm}%` } },
      ];
    }

    // Active status filter
    if (is_active !== undefined) {
      whereClause.is_active = is_active === "true";
    }

    // City filter
    if (city && city.trim()) {
      whereClause.city = { [Op.iLike]: `%${city.trim()}%` };
    }

    // State filter
    if (state && state.trim()) {
      whereClause.state = { [Op.iLike]: `%${state.trim()}%` };
    }

    // Country filter
    if (country && country.trim()) {
      whereClause.country = { [Op.iLike]: `%${country.trim()}%` };
    }

    // Validate sort parameters
    const allowedSortFields = ['name', 'city', 'state', 'country', 'createdAt', 'updatedAt'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const validSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    const { count, rows: inventoryLocations } = await ProductLocation.findAndCountAll({
      where: whereClause,
      limit: limitNum,
      offset: offset,
      order: [[validSortBy, validSortOrder]],
    });

    const totalPages = Math.ceil(count / limitNum);

    return res.status(200).json({
      success: true,
      data: {
        inventoryLocations,
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

const updateInventoryLocation = asyncHandler(async (req, res, next) => {
  const transaction = await models.db.sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { name, address, pincode, city, state, country, phone, is_active } = req.body;

    if (!id) {
      await transaction.rollback();
      return next(new ErrorHandler("Location ID is required", 400));
    }

    const inventoryLocation = await ProductLocation.findByPk(id, { transaction });
    
    if (!inventoryLocation) {
      await transaction.rollback();
      return next(new ErrorHandler("Inventory location not found", 404));
    }

    // Sanitize input data
    const sanitizedData = sanitizeLocationData({
      name, address, pincode, city, state, country, phone, is_active
    });

    // Validate name if being updated
    if (sanitizedData.name !== undefined) {
      if (!sanitizedData.name || sanitizedData.name.length < 1 || sanitizedData.name.length > 100) {
        await transaction.rollback();
        return next(new ErrorHandler("Location name must be between 1 and 100 characters", 400));
      }

      // Check if name is being updated and already exists
      if (sanitizedData.name.toLowerCase() !== inventoryLocation.name.toLowerCase()) {
        const existingLocation = await ProductLocation.findOne({
          where: {
            name: { [Op.iLike]: sanitizedData.name.toLowerCase() },
            id: { [Op.ne]: id },
          },
          transaction,
        });

        if (existingLocation) {
          await transaction.rollback();
          return next(new ErrorHandler("A location with this name already exists", 409));
        }
      }
    }

    // Validate phone number if being updated
    if (sanitizedData.phone !== undefined && sanitizedData.phone && !validatePhoneNumber(sanitizedData.phone)) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid phone number format. Only digits, spaces, +, -, and parentheses are allowed", 400));
    }

    // Validate pincode if being updated
    if (sanitizedData.pincode !== undefined && sanitizedData.pincode && !validatePincode(sanitizedData.pincode)) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid pincode format", 400));
    }

    // Prepare update data
    const updateData = {};
    Object.keys(sanitizedData).forEach(key => {
      if (sanitizedData[key] !== undefined) {
        updateData[key] = sanitizedData[key];
      }
    });

    // Update the inventory location
    await inventoryLocation.update(updateData, { transaction });
    await transaction.commit();

    // Fetch updated data
    const updatedLocation = await ProductLocation.findByPk(id);

    return res.status(200).json({
      success: true,
      message: "Inventory location updated successfully",
      data: updatedLocation,
    });
  } catch (error) {
    await transaction.rollback();
    
    // Handle Sequelize validation errors
    if (error.name === 'SquelizeValidationError') {
      const validationErrors = error.errors.map(err => err.message);
      return next(new ErrorHandler(validationErrors.join(', '), 400));
    }
    
    return next(new ErrorHandler(error.message, 500));
  }
});

const deleteInventoryLocation = asyncHandler(async (req, res, next) => {
  const transaction = await models.db.sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { force = false } = req.query;

    if (!id) {
      await transaction.rollback();
      return next(new ErrorHandler("Location ID is required", 400));
    }

    const inventoryLocation = await ProductLocation.findByPk(id, { transaction });

    if (!inventoryLocation) {
      await transaction.rollback();
      return next(new ErrorHandler("Inventory location not found", 404));
    }

    // Check for dependencies (you can add more checks based on your business logic)
    // For example, if you have inventory items or products associated with this location
    if (!force) {
      // Add checks for related records here
      // Example: Check if there are any inventory items at this location
      // const hasInventoryItems = await InventoryItem.count({
      //   where: { locationId: id },
      //   transaction
      // });
      
      // if (hasInventoryItems > 0) {
      //   await transaction.rollback();
      //   return res.status(409).json({
      //     success: false,
      //     message: "Cannot delete location with existing inventory items. Use force=true to cascade delete.",
      //     inventoryItems: hasInventoryItems,
      //   });
      // }
    }

    // Soft delete option - you can modify this to set is_active to false instead of actual deletion
    // await inventoryLocation.update({ is_active: false }, { transaction });
    
    // Hard delete
    await inventoryLocation.destroy({ transaction });
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Inventory location deleted successfully",
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

// Additional utility function to get location statistics
const getInventoryLocationStats = asyncHandler(async (req, res, next) => {
  try {
    const totalLocations = await InventoryLocation.count();
    const activeLocations = await InventoryLocation.count({
      where: { is_active: true }
    });
    const inactiveLocations = totalLocations - activeLocations;

    // Get locations by country
    const locationsByCountry = await InventoryLocation.findAll({
      attributes: [
        'country',
        [models.db.sequelize.fn('COUNT', models.db.sequelize.col('id')), 'count']
      ],
      group: ['country'],
      order: [[models.db.sequelize.fn('COUNT', models.db.sequelize.col('id')), 'DESC']],
    });

    // Get locations by state (for the most common country)
    const locationsByState = await InventoryLocation.findAll({
      attributes: [
        'state',
        [models.db.sequelize.fn('COUNT', models.db.sequelize.col('id')), 'count']
      ],
      where: { country: 'India' }, // Adjust based on your primary country
      group: ['state'],
      order: [[models.db.sequelize.fn('COUNT', models.db.sequelize.col('id')), 'DESC']],
      limit: 10,
    });

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          totalLocations,
          activeLocations,
          inactiveLocations,
        },
        locationsByCountry,
        locationsByState,
      },
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Bulk operations
// const bulkUpdateInventoryLocations = asyncHandler(async (req, res, next) => {
//   const transaction = await models.db.sequelize.transaction();
  
//   try {
//     const { locationIds, updateData } = req.body;

//     if (!locationIds || !Array.isArray(locationIds) || locationIds.length === 0) {
//       await transaction.rollback();
//       return next(new ErrorHandler("Location IDs array is required", 400));
//     }

//     if (!updateData || Object.keys(updateData).length === 0) {
//       await transaction.rollback();
//       return next(new ErrorHandler("Update data is required", 400));
//     }

//     // Sanitize update data
//     const sanitizedUpdateData = sanitizeLocationData(updateData);

//     // Validate phone number if being updated
//     if (sanitizedUpdateData.phone !== undefined && sanitizedUpdateData.phone && !validatePhoneNumber(sanitizedUpdateData.phone)) {
//       await transaction.rollback();
//       return next(new ErrorHandler("Invalid phone number format", 400));
//     }

//     // Validate pincode if being updated
//     if (sanitizedUpdateData.pincode !== undefined && sanitizedUpdateData.pincode && !validatePincode(sanitizedUpdateData.pincode)) {
//       await transaction.rollback();
//       return next(new ErrorHandler("Invalid pincode format", 400));
//     }

//     const [updatedCount] = await InventoryLocation.update(sanitizedUpdateData, {
//       where: {
//         id: { [Op.in]: locationIds }
//       },
//       transaction
//     });

//     await transaction.commit();

//     return res.status(200).json({
//       success: true,
//       message: `${updatedCount} inventory locations updated successfully`,
//       data: { updatedCount },
//     });
//   } catch (error) {
//     await transaction.rollback();
//     return next(new ErrorHandler(error.message, 500));
//   }
// });

module.exports = {
  createInventoryLocation,
  getInventoryLocationById,
  getAllInventoryLocations,
  updateInventoryLocation,
  deleteInventoryLocation,
  getInventoryLocationStats,
//   bulkUpdateInventoryLocations,
};