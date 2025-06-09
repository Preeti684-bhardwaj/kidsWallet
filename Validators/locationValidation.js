// Utility function to validate phone number format
const validatePhoneNumber = (phone) => {
    if (!phone) return true; // Allow empty phone numbers
    const phoneRegex = /^[\d\s\-\+\(\)]{3,20}$/;
    return phoneRegex.test(phone.trim());
  };
  
  // Utility function to validate pincode format
  const validatePincode = (pincode) => {
    if (!pincode) return true; // Allow empty pincode
    const pincodeRegex = /^[0-9A-Za-z\s\-]{3,20}$/;
    return pincodeRegex.test(pincode.trim());
  };
  
  // Utility function to sanitize input data
  const sanitizeLocationData = (data) => {
    const sanitized = {};
    
    if (data.name !== undefined) {
      sanitized.name = data.name?.toString().trim();
    }
    if (data.address !== undefined) {
      sanitized.address = data.address?.toString().trim() || null;
    }
    if (data.pincode !== undefined) {
      sanitized.pincode = data.pincode?.toString().trim() || null;
    }
    if (data.city !== undefined) {
      sanitized.city = data.city?.toString().trim() || null;
    }
    if (data.state !== undefined) {
      sanitized.state = data.state?.toString().trim() || null;
    }
    if (data.country !== undefined) {
      sanitized.country = data.country?.toString().trim();
    }
    if (data.phone !== undefined) {
      sanitized.phone = data.phone?.toString().trim() || null;
    }
    if (data.is_active !== undefined) {
      sanitized.is_active = Boolean(data.is_active);
    }
    
    return sanitized;
  };

module.exports = {
    validatePhoneNumber,
    validatePincode,
    sanitizeLocationData
  };