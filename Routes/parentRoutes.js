const express = require('express');
const router = express.Router();
const {
    signup,
    login,
    sendOtp,
    verifyOTP,
    forgotPassword,
    resetPassword,
    getParentDetail,
    getParentDetailById,
    updateProfile,
    createChild,
    getAllChildren,
    getChildById,
    updateChildProfile,
    getParentNotifications,
    deleteUserByEmail,
    deleteChldAccount,
    deleteProfile,
} = require('../Controllers/parentController');
const { authenticateToken} = require("../Middlewares/auth");
const upload = require("../Middlewares/multer");


// Delegate routing to the controller
router.post("/auth/signup",upload.single('image'), signup);
router.post("/auth/login", login);
router.post("/auth/send-otp",sendOtp);
router.post("/auth/verify-otp", verifyOTP);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get('/detail', authenticateToken, getParentDetail);
router.get('/detail/:id', getParentDetailById);
router.put('/update/detail',authenticateToken,upload.single('image'),  updateProfile);
router.delete("/delete/parent-by-email",deleteUserByEmail);
router.delete("/delete/detail", authenticateToken, deleteProfile);
router.get("/get_notification",authenticateToken,getParentNotifications);
router.post("/create/children",authenticateToken, upload.single('profilePicture'),createChild);
router.get("/get_all/child",authenticateToken,getAllChildren);  
router.get("/get_child_detail/:childId",authenticateToken,getChildById); 
router.put("/update/child_detail/:childId",authenticateToken, upload.single('profilePicture'),updateChildProfile) 
router.delete("/delete/child_account", authenticateToken, deleteChldAccount);  
// router.use('/', parentController.router);

module.exports = router;