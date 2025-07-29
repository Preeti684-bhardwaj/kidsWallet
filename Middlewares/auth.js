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
    
    const userType = decoded.obj.type;
    const userId = decoded.obj.id;
    const tokenVersion = decoded.obj.tokenVersion || 0; // Extract tokenVersion from token

    if (userType === "parent") {
      // Find parent
      const parent = await models.Parent.findOne({
        where: { id: userId },
        attributes: { exclude: ["password", "otp", "otpExpire"] },
      });

      if (!parent) {
        return res.status(404).json({ error: "Parent not found" });
      }

      // Check if token version matches current user's token version
      const currentTokenVersion = parent.tokenVersion || 0;
      if (tokenVersion !== currentTokenVersion) {
        return next(new ErrorHandler("Token has been invalidated. Please login again.", 401));
      }

      // Check if parent account is active
      if (!parent.isActive) {
        return next(new ErrorHandler("Account has been deactivated", 403));
      }
      
      req.parent = parent;
      req.userType = "parent";
      console.log("Parent authenticated successfully:", parent.id);
      
    } else if (userType === "admin") {
      // Find admin
      const admin = await models.Admin.findOne({
        where: { id: userId },
        attributes: { exclude: ["password"] },
      });

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      // Check if token version matches current admin's token version (if admin has tokenVersion field)
      if (admin.tokenVersion !== undefined) {
        const currentTokenVersion = admin.tokenVersion || 0;
        if (tokenVersion !== currentTokenVersion) {
          return next(new ErrorHandler("Token has been invalidated. Please login again.", 401));
        }
      }
      
      req.admin = admin;
      req.userType = "admin";
      console.log("Admin authenticated successfully:", admin.id);
      
    } else {
      return res.status(403).json({ error: "Invalid user type in token" });
    }
    
    req.token = token;
    next();
  } catch (error) {
    console.log("Authentication error:", error.message);
    if (error.name === 'TokenExpiredError') {
      return next(new ErrorHandler("Token has expired. Please login again.", 401));
    }
    if (error.name === 'JsonWebTokenError') {
      return next(new ErrorHandler("Invalid token format", 401));
    }
    return res.status(403).json({ error: "Invalid token" });
  }
};

exports.authenticateAdminToken = async (req, res, next) => {
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
    const tokenVersion = decoded.obj.tokenVersion || 0; // Extract tokenVersion from token
    
    // Find admin
    const admin = await models.Admin.findOne({
      where: { id: decoded.obj.id },
      attributes: { exclude: ["password"] },
    });

    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    // Check if token version matches current admin's token version (if admin has tokenVersion field)
    if (admin.tokenVersion !== undefined) {
      const currentTokenVersion = admin.tokenVersion || 0;
      if (tokenVersion !== currentTokenVersion) {
        return next(new ErrorHandler("Token has been invalidated. Please login again.", 401));
      }
    }
    
    req.admin = admin;
    req.token = token;
    
    next();
  } catch (error) {
    console.log("Admin authentication error:", error.message);
    if (error.name === 'TokenExpiredError') {
      return next(new ErrorHandler("Token has expired. Please login again.", 401));
    }
    if (error.name === 'JsonWebTokenError') {
      return next(new ErrorHandler("Invalid token format", 401));
    }
    return res.status(403).json({ error: "Invalid token" });
  }
}

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
    const tokenVersion = decoded.obj.tokenVersion || 0; // Extract tokenVersion from token
    
    // Find child
    const child = await models.Child.findOne({
      where: { id: childId },
      attributes: { exclude: ["password"] },
    });

    if (!child) {
      return res.status(404).json({ error: "Child not found" });
    }

    // Check if token version matches current child's token version (if child has tokenVersion field)
    if (child.tokenVersion !== undefined) {
      const currentTokenVersion = child.tokenVersion || 0;
      if (tokenVersion !== currentTokenVersion) {
        return next(new ErrorHandler("Token has been invalidated. Please login again.", 401));
      }
    }

    req.child = child;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new ErrorHandler("Token has expired. Please login again.", 401));
    }
    if (error.name === 'JsonWebTokenError') {
      return next(new ErrorHandler("Invalid token format", 401));
    }
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
    console.log(decoded);
    
    const tokenVersion = decoded.obj.tokenVersion || 0; // Extract tokenVersion from token
    
    // Check user type and set appropriate properties
    if (decoded.obj && decoded.obj.type === 'child') {
      // Find child in database to get full details
      const child = await models.Child.findOne({
        where: { id: decoded.obj.id },
        attributes: { exclude: ["password"] },
      });

      if (!child) {
        return next(new ErrorHandler("Child not found", 404));
      }

      // Check if token version matches current child's token version (if child has tokenVersion field)
      if (child.tokenVersion !== undefined) {
        const currentTokenVersion = child.tokenVersion || 0;
        if (tokenVersion !== currentTokenVersion) {
          return next(new ErrorHandler("Token has been invalidated. Please login again.", 401));
        }
      }

      req.child = child;
      req.user = decoded; // Also set as user for unified access
      req.userType = 'child';
      
    } else if (decoded.obj && decoded.obj.type === 'parent') {
      console.log('hi i am here');
      console.log(decoded.obj.id);
      // Find parent in database to get full details
      const parent = await models.Parent.findOne({
        where: { id: decoded?.obj?.id },
        attributes: { exclude: ["password", "otp", "otpExpire"] },
      });

      if (!parent) {
        return next(new ErrorHandler("Parent not found", 404));
      }

      // Check if token version matches current parent's token version
      const currentTokenVersion = parent.tokenVersion || 0;
      if (tokenVersion !== currentTokenVersion) {
        return next(new ErrorHandler("Token has been invalidated. Please login again.", 401));
      }

      // Check if parent account is active
      if (!parent.isActive) {
        return next(new ErrorHandler("Account has been deactivated", 403));
      }

      req.parent = parent;
      req.user = decoded; // Also set as user for unified access
      req.userType = 'parent';
      
    } else if (decoded.obj && decoded.obj.type === 'admin') {
      console.log('hi i am coming here');
      
      // Find admin in database to get full details
      const admin = await models.Admin.findOne({
        where: { id: decoded.obj.id },
        attributes: { exclude: ["password"] },
      });

      if (!admin) {
        return next(new ErrorHandler("Admin not found", 404));
      }

      // Check if token version matches current admin's token version (if admin has tokenVersion field)
      if (admin.tokenVersion !== undefined) {
        const currentTokenVersion = admin.tokenVersion || 0;
        if (tokenVersion !== currentTokenVersion) {
          return next(new ErrorHandler("Token has been invalidated. Please login again.", 401));
        }
      }

      req.admin = admin;
      req.user = decoded; // Also set as user for unified access
      req.userType = 'admin';
      
    } else {
      return next(new ErrorHandler("Invalid token format", 401));
    }

    req.token = token;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new ErrorHandler("Token has expired. Please login again.", 401));
    }
    if (error.name === 'JsonWebTokenError') {
      return next(new ErrorHandler("Invalid token format", 401));
    }
    return next(new ErrorHandler("Invalid token", 401));
  }
});