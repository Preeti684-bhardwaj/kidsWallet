// Validation helper functions
const validateProductData = (data) => {
    const errors = [];
    
    if (!data.name || !data.name.trim()) {
      errors.push("Product name is required");
    }
    
    if (data.name && data.name.trim().length < 2) {
      errors.push("Product name must be at least 2 characters long");
    }
    
    if (data.name && data.name.trim().length > 255) {
      errors.push("Product name cannot exceed 255 characters");
    }
    
    if (data.status && !['active', 'draft', 'archived'].includes(data.status)) {
      errors.push("Status must be 'active', 'draft', or 'archived'");
    }
    
    if (data.seo_title && data.seo_title.length > 255) {
      errors.push("SEO title cannot exceed 255 characters");
    }
    
    if (data.vendor && data.vendor.length > 255) {
      errors.push("Vendor name cannot exceed 255 characters");
    }
    
    if (data.type && data.type.length > 255) {
      errors.push("Product type cannot exceed 255 characters");
    }
    
    return errors;
  };
  
  const validateSpecifications = (specifications) => {
    if (!specifications) return [];
    
    const errors = [];
    
    try {
      if (typeof specifications === 'string') {
        JSON.parse(specifications);
      } else if (typeof specifications === 'object') {
        JSON.stringify(specifications);
      } else {
        errors.push("Specifications must be a valid JSON object");
      }
    } catch (error) {
      errors.push("Specifications must be valid JSON");
    }
    
    return errors;
  };
  
module.exports = {
  validateProductData,
  validateSpecifications,
};