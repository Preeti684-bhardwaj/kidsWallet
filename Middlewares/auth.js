const models = require("../Modals/index");
require('dotenv').config();
const jwt = require("jsonwebtoken");
const { detectOS } = require("../Validators/parentValidation");
const ErrorHandler = require("../Utils/errorHandle");
const asyncHandler = require("../Utils/asyncHandler");

exports.authenticateToken = async (req, res, next) => {
  try {
    // Get the token from Authorization header
    const bearerHeader = req.headers["authorization"];

    // Check if bearer header exists
    if (!bearerHeader) {
      return next(new ErrorHandler("Access Denied.", 401));
    }

    // Extract the token
    // Format in Postman: "Bearer eyJhbGciOiJIUzI1NiIs..."
    const token = bearerHeader.replace("Bearer ", "").trim();

    if (!token) {
      return next(new ErrorHandler("Authentication token required.", 401));
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(decoded);
    const parentId = decoded.obj.id;
    // Find user
    const parent = await models.Parent.findOne({
      where: { id: parentId },
      attributes: { exclude: ["password","otp","otpExpire"] },
    });

    if (!parent) {
      return res.status(404).json({ error: "Parent not found" });
    }
    req.parent = parent;
    console.log("Parent authenticated successfully:", parent.id);
    
    req.token = token;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Invalid token" });
  }
};

exports.verifyUserAgent = async (req, res, next) => {
  try {
    console.log(req.headers);
    // Determine platform and OS
    const userAgent = req.headers["user-agent"];
    const os = detectOS(userAgent);
    req.userOS = os;

    console.log(req.userOS);

    next();
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
};

exports.authenticateChildToken = asyncHandler(async (req, res, next) => {
  try {
    // Get the token from Authorization header
    const bearerHeader = req.headers["authorization"];
console.log("hii i m in auth");

    // Check if bearer header exists
    if (!bearerHeader) {
      return next(new ErrorHandler("Access Denied.", 401));
    }

    // Extract the token
    // Format in Postman: "Bearer eyJhbGciOiJIUzI1NiIs..."
    const token = bearerHeader.replace("Bearer ", "").trim();

    if (!token) {
      return next(new ErrorHandler("Authentication token required.", 401));
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(decoded);
    const childId = decoded.obj.id;
    // Find child
    const child = await models.Child.findOne({
      where: { id: childId },
      attributes: { exclude: ["password"] },
    });

    if (!child) {
      return res.status(404).json({ error: "Child not found" });
    }
    req.child = child;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Invalid token" });
  }
});

exports.authenticateUnifiedToken = asyncHandler(async (req, res, next) => {
  try {
    const bearerHeader = req.headers["authorization"];
    console.log("hii i m in auth");
    
        // Check if bearer header exists
        if (!bearerHeader) {
          return next(new ErrorHandler("Access Denied.", 401));
        }
    
        // Extract the token
        // Format in Postman: "Bearer eyJhbGciOiJIUzI1NiIs..."
        const token = bearerHeader.replace("Bearer ", "").trim();
    
    if (!token) {
      return next(new ErrorHandler("No authorization token provided", 401));
    }

    // Verify and decode token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check user type and set appropriate properties
    if (decoded.obj && decoded.obj.type === 'child') {
      req.child = decoded;
      req.user = decoded; // Also set as user for unified access
    } else if (decoded.obj && decoded.obj.type === 'parent') {
      req.parent = decoded;
      req.user = decoded; // Also set as user for unified access
    } else {
      return next(new ErrorHandler("Invalid token format", 401));
    }

    next();
  } catch (error) {
    return next(new ErrorHandler("Invalid token", 401));
  }
});