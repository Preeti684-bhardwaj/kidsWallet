const bcrypt = require("bcrypt");
const models = require("../Modals/index");
const db = require("../Configs/db/DbConfig");
const sequelize = db.sequelize;
const { generateToken} = require("../Utils/parentHelper");
const {
  isValidEmail,
  isValidUsernameLength,
  isValidPassword,
  isValidLength,
} = require("../Validators/parentValidation");
const { uploadFile ,deleteFile} = require("../Utils/cdnImplementation");
const { validateFiles } = require("../Validators/assetValidation");
const ErrorHandler = require("../Utils/errorHandle");
const asyncHandler = require("../Utils/asyncHandler");

// ---------------signup------------------------------------------------
const signup = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { email, password } =
      req.body;

    // Validation - only check required fields (name, email, password)
    if ([email, password].some((field) => field?.trim() === "")) {
      return next(new ErrorHandler("All required fields must be filled", 400));
    }
    // Validate input fields
    if (!email) {
      return next(new ErrorHandler("Email is missing", 400));
    }
    if (!password) {
      return next(new ErrorHandler("Password is missing", 400));
    }
    // Convert the email to lowercase for case-insensitive comparison
    const lowercaseEmail = email.trim().toLowerCase();

    // Validate email format
    if (!isValidEmail(lowercaseEmail)) {
      return next(new ErrorHandler("Invalid email", 400));
    }

    // Check only for email uniqueness
    const existingAdmin = await models.Admin.findOne({
      where: { email: lowercaseEmail },
    });

    if (existingAdmin) {
      if (existingAdmin.isEmailVerified) {
        return next(new ErrorHandler("Email already in use", 409));
      } else {
        return next(new ErrorHandler("Email already in use", 409));
      }
    }

    // Validate the password
    const passwordValidationResult = isValidPassword(password);
    if (passwordValidationResult) {
      return next(new ErrorHandler(passwordValidationResult, 400));
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const admin = await models.Admin.create(
      {
        email,
        password: hashedPassword
      },
      { transaction }
    );

    await transaction.commit();

    // Remove sensitive data from response
    const adminData = admin.toJSON();
    delete adminData.password;
    delete adminData.isEmailVerified;

    return res.status(201).json({
      success: true,
      message: "Admin created successfully",
      user: adminData,
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

// -----------------login------------------------------------------------
const login = asyncHandler(async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validation
    if ([email, password].some((field) => field?.trim() === "")) {
      return next(new ErrorHandler("All required fields must be filled", 400));
    }
    const lowercaseEmail = email.trim().toLowerCase();
    // Validate email format
    if (!isValidEmail(lowercaseEmail)) {
      return next(new ErrorHandler("Invalid email", 400));
    }
    // Find user
    const admin = await models.Admin.findOne({
      where: { email: lowercaseEmail },
    });
    if (!admin) {
      return next(new ErrorHandler("Admin not found", 404));
    }

    // Verify password
    const isPasswordMatched = await bcrypt.compare(password, admin.password);
    // console.log("Password match result:", isPasswordMatched);

    if (!isPasswordMatched) {
      return next(new ErrorHandler("Invalid password", 400));
    }

    // Check if user is verified
    if (!admin.isEmailVerified) {
      return next(new ErrorHandler("Please verify your email", 400));
    }

    let obj = {
      type: "admin",
      id: admin.id,
      email: admin.email,
    };

    // Generate token
    const token = generateToken(obj);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: admin.id,
        email: admin.email,
        isEmailVerified: admin.isEmailVerified,
      },
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// ---------------RESET PASSWORD------------------------------------------------------------
const resetPassword = asyncHandler(async (req, res, next) => {
  try {
    const { password, email } = req.body;

    // Validate input fields
    if (!password || password.trim() === "") {
      return next(new ErrorHandler("Missing Password", 400));
    }

    const lowercaseEmail = email.toLowerCase().trim();
    const passwordValidationResult = isValidPassword(password);
    if (passwordValidationResult) {
      return next(new ErrorHandler(passwordValidationResult, 400));
    }
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Find the user by ID
    const admin = await models.Admin.findOne({
      where: {
        email: lowercaseEmail,
      },
    });
    if (!admin) {
      return next(new ErrorHandler("Admin not found", 404));
    }

    // Update the user's password and clear OTP fields
    admin.password = hashedPassword;
    await admin.save();

    return res.status(200).json({
      success: true,
      message: `Password reset successfully`,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// ------------get parent detail by token------------------------------------------
const getAdminDetail = asyncHandler(async (req, res, next) => {
  try {
    const admin = req.admin; // assuming req.parent is a Parent model instance
    // Remove sensitive data from response
    const adminData = admin.toJSON();
    delete adminData.password;
    return res.status(200).json({
      success: true,
      message: "Admin details retrieved successfully",
      user: adminData,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});
 
const getAllParents = asyncHandler(async (req, res, next) => {
  try {
    const parents = await models.Parent.findAll({
      attributes: ["id", "email", "name", "image","gender","isActive","isEmailVerified","createdAt","updatedAt"],
      order: [["createdAt", "DESC"]],
    });

    if (!parents || parents.length === 0) {
      return next(new ErrorHandler("No users found",404));
    }

    return res.status(200).json({
      success: true,
      message: "Users retrieved successfully",
      data: parents,
    });
  } catch (error) {
    console.error("Error retrieving parents:", error);
    return next(new ErrorHandler(error.message || "Failed to retrieve parents", 500));
  }
});

//--------------------create child profile--------------------------------------------------
// const createChild = asyncHandler(async (req, res, next) => {
//   try {
//     const parentId = req.parent.id;
//     const {
//       name,
//       age,
//       username,
//       profilePicture,
//       gender,
//       password,
//       hasBlogAccess,
//       deviceSharingMode,
//     } = req.body;
//     // Sanitize name: trim and reduce multiple spaces to a single space
//     const sanitizedName = name.trim().replace(/\s+/g, " ");
//     const sanatizedUsername = username.trim().replace(/\s+/g, " ");
//     console.log("sanatizeUsername", sanatizedUsername);

//     // Validate name
//     const nameError = isValidLength(sanitizedName);
//     if (nameError) {
//       return next(new ErrorHandler(nameError, 400));
//     }
//     const usernameError = isValidUsernameLength(sanatizedUsername);
//     if (usernameError) {
//       console.log("usernameError", usernameError);
//       return next(new ErrorHandler(usernameError, 400));
//     }
//     if (gender) {
//       // Validate recurrence
//       const allowedGender = ["male", "female", "other"];
//       if (gender && (!gender || !allowedGender.includes(gender))) {
//         return next(
//           new ErrorHandler("Invalid input. Allowed: male, female, other.", 400)
//         );
//       }
//     }
//     // Validate the password and create a new user
//     const passwordValidationResult = isValidPassword(password);
//     if (passwordValidationResult) {
//       return next(new ErrorHandler(passwordValidationResult, 400));
//     }

//     // Hash password
//     const hashedPassword = await bcrypt.hash(password, 10);
//     // Validate parent exists
//     const parent = await models.Parent.findByPk(parentId);
//     if (!parent) {
//       return next(new ErrorHandler("Parent not found", 404));
//     }

//     // Check if username already exists
//     const existingChild = await models.Child.findOne({
//       where: { username: sanatizedUsername },
//     });
//     if (existingChild) {
//       return next(new ErrorHandler("Username already taken", 400));
//     }

//     // Create child account
//     const newChild = await models.Child.create({
//       name: sanitizedName,
//       age,
//       gender,
//       profilePicture,
//       username: sanatizedUsername,
//       password: hashedPassword || null,
//       parentId,
//       hasBlogAccess: hasBlogAccess || false,
//       deviceSharingMode: deviceSharingMode || false,
//     });

//     // Create initial streak record
//     await models.Streak.create({
//       childId: newChild.id,
//       currentStreak: 0,
//     });

//     return res.status(201).json({
//       success: true,
//       message: "Child account created successfully",
//       data: {
//         id: newChild.id,
//         name: newChild.name,
//         age: newChild.age,
//         username: newChild.username,
//         gender: newChild.gender,
//         profilePicture: newChild.profilePicture,
//         hasBlogAccess: newChild.hasBlogAccess,
//         deviceSharingMode: newChild.deviceSharingMode,
//       },
//     });
//   } catch (error) {
//     console.error("Error creating child account:", error);
//     return next(
//       new ErrorHandler(error.message || "Failed to create child account", 500)
//     );
//   }
// });

// -----------------delete user by email--------------------------------
const deleteUserByEmail = asyncHandler(async (req, res, next) => {
  try {
    const { email } = req.query;

    if (!email || email.trim() === "") {
      return next(new ErrorHandler("Email is required", 400));
    }

    const lowercaseEmail = email.trim().toLowerCase();

    const user = await models.Admin.findOne({
      where: { email: lowercaseEmail },
    });

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    await user.destroy();

    return res.status(200).json({
      success:true,
      message: "User deleted successfully",
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

//---------- Delete parent profile----------------------
const deleteProfile = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const parent = req.admin; // assuming req.parent is a Parent model instance

    await parent.destroy({ transaction }); // CASCADE delete happens here

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Admin deleted successfully",
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

//-----------------upload to files CDN------------------------------------------

const uploadContent = asyncHandler(async (req, res, next) => {
  try {
    // Validate file request
    if (!req.files || req.files.length === 0) {
      return next(new ErrorHandler("No files uploaded", 400));
    }

    // Validate file type and size if needed
    const fileError = validateFiles(req.files);
    if (fileError) {
      return next(new ErrorHandler(fileError, 400));
    }

    // Array to store upload results
    const uploadResults = [];
    const savedAssets = [];

    // Process each uploaded file
    for (const file of req.files) {
      try {
        // Upload to CDN
        const cdnResult = await uploadFile(file);
console.log("CDN Result:", cdnResult);

        // Prepare upload result
        const uploadData = {
          fileName: cdnResult.filename,
          originalName: cdnResult.originalName,
          fileType: cdnResult.mimetype,
          fileSize: cdnResult.size,
          cdnUrl: cdnResult.url,
          uploadedAt: new Date().toISOString(),
        };

        // Save to Asset table
        const asset = await models.Asset.create({
          adminId: req.admin?.id, // assuming admin ID comes from authenticated user
          assetData: {
            fileName: cdnResult.filename,
            originalName: cdnResult.originalName,
            fileType: cdnResult.mimetype,
            fileSize: cdnResult.size,
            cdnUrl: cdnResult.url,
            uploadedAt: new Date().toISOString(),
          }
        });

        uploadResults.push(uploadData);
        // savedAssets.push(asset);

      } catch (uploadError) {
        console.error(`Error uploading file ${file.originalname}:`, uploadError);
        // Optional: you can choose to stop processing or continue
        return next(new ErrorHandler(`Failed to upload ${file.originalname}`, 500));
      }
    }

    // Respond with upload results and saved assets
    return res.status(200).json({
      success: true,
      message: `Successfully uploaded ${uploadResults.length} file(s)`,
      data: {
        uploads: uploadResults,
        // assets: savedAssets
      }
    });

  } catch (error) {
    console.error("Upload Content Error:", error);
    return next(new ErrorHandler("Upload failed", 500));
  }
});

// Get all assets
const getAllAssets = asyncHandler(async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const adminId = req.admin?.id; // Assuming admin ID comes from authenticated user 
    
    // Build where clause
    const whereClause = {};
    if (adminId) {
      whereClause.adminId = adminId;
    }

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Get assets with pagination
    const { count, rows: assets } = await models.Asset.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']], // Latest first
    });

    // Calculate total pages
    const totalPages = Math.ceil(count / limit);

    return res.status(200).json({
      success: true,
      message: "Assets retrieved successfully",
      data: {
        assets,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: count,
          itemsPerPage: parseInt(limit),
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        }
      }
    });

  } catch (error) {
    console.error("Get All Assets Error:", error);
    return next(new ErrorHandler("Failed to retrieve assets", 500));
  }
});

// Get single asset by ID
const getAssetById = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate ID format (UUID)
    // if (!id || !isValidUUID(id)) {
    //   return next(new ErrorHandler("Invalid asset ID format", 400));
    // }

    // Find asset by ID
    const asset = await models.Asset.findByPk(id);

    if (!asset) {
      return next(new ErrorHandler("Asset not found", 404));
    }

    return res.status(200).json({
      success: true,
      message: "Asset retrieved successfully",
      data: asset
    });

  } catch (error) {
    console.error("Get Asset By ID Error:", error);
    return next(new ErrorHandler("Failed to retrieve asset", 500));
  }
});

const deleteContent = asyncHandler(async (req, res, next) => {
  try {
    const { fileName } = req.query;
    const adminId = req.admin?.id;

    // Validate fileName
    if (!fileName) {
      return next(new ErrorHandler("File name is required in query parameters", 400));
    }

    // Find all assets for this admin
    const assets = await models.Asset.findAll({
      where: { adminId: adminId }
    });

    // Find the specific asset with the matching fileName
    const asset = assets.find(asset => 
      asset.assetData && asset.assetData.fileName === fileName
    );

    if (!asset) {
      return next(new ErrorHandler('File not found in your assets.', 404));
    }

    let cdnDeletionStatus = "skipped";

    try {
      // Try to delete from CDN first
      await deleteFile(fileName);
      cdnDeletionStatus = "success";
    } catch (cdnError) {
      console.error("CDN deletion error:", cdnError);
      
      // If file not found in CDN, continue with database deletion
      if (cdnError.message.includes("not found") || cdnError.message.includes("NotFound")) {
        console.log(`File ${fileName} not found in CDN, continuing with database deletion`);
        cdnDeletionStatus = "file_not_found_in_cdn";
      } else {
        // For other CDN errors, fail the operation
        return next(new ErrorHandler(`CDN deletion failed: ${cdnError.message}`, 500));
      }
    }

    // Delete the database record
    await asset.destroy();

    return res.status(200).json({
      success: true,
      message: "Asset deleted successfully",
      data: {
        deletedAsset: {
          id: asset.id,
          fileName: asset.assetData?.fileName,
          originalName: asset.assetData?.originalName
        },
        cdnDeletionStatus
      }
    });

  } catch (error) {
    console.error("Delete Content Error:", error);
    return next(new ErrorHandler(`Deletion failed: ${error.message}`, 500));
  }
});

// // Get assets by admin ID
// const getAssetsByAdmin = asyncHandler(async (req, res, next) => {
//   try {
//     const { adminId } = req.params;
//     const { page = 1, limit = 10 } = req.query;

//     // Validate admin ID format (UUID)
//     if (!adminId || !isValidUUID(adminId)) {
//       return next(new ErrorHandler("Invalid admin ID format", 400));
//     }

//     // Calculate offset for pagination
//     const offset = (page - 1) * limit;

//     // Get assets for specific admin
//     const { count, rows: assets } = await Asset.findAndCountAll({
//       where: { adminId },
//       limit: parseInt(limit),
//       offset: parseInt(offset),
//       order: [['createdAt', 'DESC']],
//     });

//     // Calculate total pages
//     const totalPages = Math.ceil(count / limit);

//     return res.status(200).json({
//       success: true,
//       message: `Assets for admin ${adminId} retrieved successfully`,
//       data: {
//         assets,
//         pagination: {
//           currentPage: parseInt(page),
//           totalPages,
//           totalItems: count,
//           itemsPerPage: parseInt(limit),
//           hasNextPage: page < totalPages,
//           hasPrevPage: page > 1,
//         }
//       }
//     });

//   } catch (error) {
//     console.error("Get Assets By Admin Error:", error);
//     return next(new ErrorHandler("Failed to retrieve admin assets", 500));
//   }
// });

module.exports = {
  signup,
  login,
  resetPassword,
  getAdminDetail,
  getAllParents,
//   createChild,
  deleteUserByEmail,
  deleteProfile,
  uploadContent,
  getAllAssets,
  getAssetById,
  deleteContent,
//   getAssetsByAdmin
};
