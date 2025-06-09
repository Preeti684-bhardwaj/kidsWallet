const multer = require('multer');

// Configure multer for memory storage
const storage = multer.memoryStorage();

// Basic file filter just to ensure the file is present
const fileFilter = (req, file, cb) => {
  if (!file) {
    cb(new Error('No file provided'), false);
  }
  cb(null, true);
};

// Configure multer with size limits
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
    // files: 5 // Maximum 5 files per request (uncomment if needed)
  }
});

module.exports = upload;