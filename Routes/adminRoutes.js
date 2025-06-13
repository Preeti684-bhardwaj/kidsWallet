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
} = require('../Controllers/adminController');
const {getParentDetailById}=require("../Controllers/parentController");
const { authenticateToken} = require("../Middlewares/auth");

// Delegate routing to the controller
router.post("/auth/signup", signup);
router.post("/auth/login", login);
router.post("/reset-password", resetPassword);
router.get('/detail', authenticateToken, getAdminDetail);
router.get('/get_all_user', authenticateToken, getAllParents);
router.delete("/delete/admin-by-email",deleteUserByEmail);
router.get('/parent_detail/:parentId', authenticateToken, getParentDetailById);
router.delete("/delete/detail", authenticateToken, deleteProfile);

module.exports = router;