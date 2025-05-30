const express = require('express');
const router = express.Router();
const {
    signup,
    login,
    resetPassword,
    getAdminDetail,
    deleteUserByEmail,
    deleteProfile,
} = require('../Controllers/adminController');
const { authenticateToken} = require("../Middlewares/auth");

// Delegate routing to the controller
router.post("/auth/signup", signup);
router.post("/auth/login", login);
router.post("/reset-password", resetPassword);
router.get('/detail', authenticateToken, getAdminDetail);
router.delete("/delete/admin-by-email",deleteUserByEmail);
router.delete("/delete/detail", authenticateToken, deleteProfile);

module.exports = router;