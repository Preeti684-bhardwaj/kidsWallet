// Constants
const CAMPAIGN_CONSTANTS = {
    MAX_FILES: 1,
    MAX_FILE_SIZE: 25 * 1024 * 1024, // 25MB
    DEFAULT_PAGE_SIZE: 10,
    MAX_PAGE_SIZE: 50,
  };
  
  // -------------file Validation------------------------------------------- 
  const validateFiles = (files) => {
    // Check if files exist
    if (!files || Object.keys(files).length === 0) {
      return "At least one file upload is required";
    }
  
    // Convert to array if it's not already (handles both array and object inputs)
    const fileArray = Array.isArray(files) ? files : Object.values(files);
  
    // Check maximum number of files
    if (fileArray.length > CAMPAIGN_CONSTANTS.MAX_FILES) {
      return `Maximum ${CAMPAIGN_CONSTANTS.MAX_FILES} files allowed`;
    }
  
    // Check each file's size
    for (const file of fileArray) {
      if (file.size > CAMPAIGN_CONSTANTS.MAX_FILE_SIZE) {
        return `File ${file.name} exceeds size limit of ${CAMPAIGN_CONSTANTS.MAX_FILE_SIZE} bytes`;
      }
    }
    // If all validations pass, return true
    return null;
  };

  module.exports = {
    validateFiles
  };