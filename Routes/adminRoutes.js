const express = require('express');
const router = express.Router();
const {
    signup,
    login,
    resetPassword,
    getAdminDetail,
    getAllParents,
    deleteUserByEmail,
    deleteProfile,
    uploadContent,
    getAllAssets,
    getAssetById,
    deleteContent
} = require('../Controllers/adminController');
const {getParentDetailById}=require("../Controllers/parentController");
const { authenticateToken,authenticateAdminToken} = require("../Middlewares/auth");
const upload = require("../Middlewares/multer");

// Delegate routing to the controller
router.post("/auth/signup", signup);
router.post("/auth/login", login);
router.post("/reset-password", resetPassword);
router.post("/upload/content", authenticateAdminToken, upload.array('files', 10),uploadContent);

// Get all assets with optional filtering (GET)
router.get('/get_all/content', authenticateAdminToken, getAllAssets);

// Get single asset by ID (GET)
router.get('/get_one_content/:id', authenticateAdminToken, getAssetById);

// // Get assets by admin ID (GET)
// router.get('/admin/:adminId', authenticateAdmin, getAssetsByAdmin);

// Delete asset by ID (DELETE)
router.delete('/delete_content',authenticateAdminToken , deleteContent);
router.get('/detail', authenticateToken, getAdminDetail);
router.get('/get_all_user', authenticateToken, getAllParents);
router.delete("/delete/admin-by-email",deleteUserByEmail);
router.get('/parent_detail/:parentId', authenticateToken, getParentDetailById);
router.delete("/delete/detail", authenticateToken, deleteProfile);

module.exports = router;