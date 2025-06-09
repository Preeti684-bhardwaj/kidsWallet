const { Op } = require("sequelize");
const models = require("../Modals/index");
const {ProductVariant} = models;


// Validation helper functions
const validateVariantData = (data) => {
    const errors = [];
    
    if (!data.price || isNaN(data.price) || parseFloat(data.price) <= 0) {
      errors.push("Valid price is required and must be greater than 0");
    }
    
    if (data.compare_at_price && (isNaN(data.compare_at_price) || parseFloat(data.compare_at_price) < 0)) {
      errors.push("Compare at price must be a valid number");
    }
    
    if (data.weight && (isNaN(data.weight) || parseFloat(data.weight) < 0)) {
      errors.push("Weight must be a valid positive number");
    }
    
    if (data.weight_unit && !["g", "kg", "oz", "lb"].includes(data.weight_unit)) {
      errors.push("Weight unit must be one of: g, kg, oz, lb");
    }
    
    if (data.max_quantity_per_order && (!Number.isInteger(parseInt(data.max_quantity_per_order)) || parseInt(data.max_quantity_per_order) < 1)) {
      errors.push("Max quantity per order must be a positive integer");
    }
    
    if (!data.attributes || !Array.isArray(data.attributes) || data.attributes.length === 0) {
      errors.push("At least one attribute is required for variant");
    }
    
    // Validate attributes structure
    if (data.attributes && Array.isArray(data.attributes)) {
      data.attributes.forEach((attr, index) => {
        if (!attr.name || typeof attr.name !== 'string' || !attr.name.trim()) {
          errors.push(`Attribute ${index + 1}: name is required`);
        }
        if (!attr.value || typeof attr.value !== 'string' || !attr.value.trim()) {
          errors.push(`Attribute ${index + 1}: value is required`);
        }
      });
    }
    
    return errors;
  };
  
  const validateBarcodeUniqueness = async (barcode, excludeId = null, transaction = null) => {
    if (!barcode) return true;
    
    const whereClause = { barcode: barcode.trim() };
    if (excludeId) {
      whereClause.id = { [Op.ne]: excludeId };
    }
    
    const existing = await ProductVariant.findOne({
      where: whereClause,
      transaction
    });
    
    return !existing;
  };

module.exports = {
    validateVariantData,
    validateBarcodeUniqueness
};