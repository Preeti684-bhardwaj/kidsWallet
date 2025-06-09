// Validation helper functions
const validateInventoryData = (data) => {
    const errors = [];
    
    if (data.quantity !== undefined) {
      if (typeof data.quantity !== 'number' || data.quantity < 0) {
        errors.push("Quantity must be a non-negative number");
      }
      if (!Number.isInteger(data.quantity)) {
        errors.push("Quantity must be an integer");
      }
    }
    
    if (data.reservedQuantity !== undefined) {
      if (typeof data.reservedQuantity !== 'number' || data.reservedQuantity < 0) {
        errors.push("Reserved quantity must be a non-negative number");
      }
      if (!Number.isInteger(data.reservedQuantity)) {
        errors.push("Reserved quantity must be an integer");
      }
    }
    
    if (data.variant_id && typeof data.variant_id !== 'string') {
      errors.push("Variant ID must be a valid UUID string");
    }
    
    if (data.location_id && typeof data.location_id !== 'string') {
      errors.push("Location ID must be a valid UUID string");
    }
    
    return errors;
  };
  
  const validateQuantityLogic = (quantity, reservedQuantity) => {
    const errors = [];
    
    if (reservedQuantity > quantity) {
      errors.push("Reserved quantity cannot exceed available quantity");
    }
    
    return errors;
  };

module.exports = {
  validateInventoryData,
  validateQuantityLogic
};