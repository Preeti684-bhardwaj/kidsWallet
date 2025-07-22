const bcrypt = require("bcrypt");
const models = require("../Modals/index");
const db = require("../Configs/db/DbConfig");
const { Op, literal } = require("sequelize");
const sequelize = db.sequelize;
const { generateToken, generateOTP ,verifyGoogleLogin } = require("../Utils/parentHelper");
const { phoneValidation } = require("../Utils/phoneValidation");
const {
  isValidEmail,
  isValidUsernameLength,
  isValidPassword,
  isValidLength,
} = require("../Validators/parentValidation");
const sendEmail = require("../Utils/sendEmail");
const ErrorHandler = require("../Utils/errorHandle");
const asyncHandler = require("../Utils/asyncHandler");
const { uploadFile, deleteFile } = require("../Utils/cdnImplementation");

// const {
//   KALEYRA_BASE_URL,
//   KALEYRA_API_KEY,
//   KALEYRA_FLOW_ID,
//   KALEYRA_PHONE_FLOW_ID,
// } = process.env;

// // Kaleyra API configuration
// const KALEYRA_CONFIG = {
//   baseURL: KALEYRA_BASE_URL,
//   apiKey: KALEYRA_API_KEY,
//   flowId: KALEYRA_FLOW_ID,
//   phoneFlowId: KALEYRA_PHONE_FLOW_ID,
// };
// const QR_EXPIRY_TIME = 5 * 60 * 1000;



// ---------------google login------------------------------------------------
const googleLogin = asyncHandler(async (req, res, next) => {
  // Start a transaction
  const transaction = await db.sequelize.transaction();

  try {
    // Get token from Authorization header and remove 'Bearer ' if present
    const authHeader = req.headers["authorization"];
    const idToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader;

    if (!idToken || idToken === "null") {
      return next(new ErrorHandler("No authentication token provided", 401));
    }

    // Verify Google token
    let googlePayload;
    try {
      googlePayload = await verifyGoogleLogin(idToken);
    } catch (error) {
      await transaction.rollback();
      if (error.message.includes("Token used too late")) {
        return next(
          new ErrorHandler(
            "Authentication token has expired. Please login again.",
            401
          )
        );
      }
      return next(new ErrorHandler("Invalid authentication token", 401));
    }

    if (!googlePayload?.sub) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid Google account information", 400));
    }

    // Try to find user by Google ID or email
    let parent = await models.Parent.findOne({
      where: {
        [db.Sequelize.Op.or]: [
          { googleUserId: googlePayload.sub },
          { email: googlePayload.email },
        ],
      },
      transaction, // Pass transaction to findOne
    });

    if (!parent) {
      // Validate email if present
      if (googlePayload.email && !isValidEmail(googlePayload.email)) {
        await transaction.rollback();
        return next(
          new ErrorHandler("Invalid email format from Google account", 400)
        );
      }

      try {
        // Create new user within transaction
        parent = await models.Parent.create(
          {
            email: googlePayload.email,
            name: googlePayload.name,
            googleUserId: googlePayload.sub,
            isEmailVerified: true,
            authProvider: "google",
            isActive: true,
          },
          { transaction }
        ); // Pass transaction to create
      } catch (error) {
        await transaction.rollback();
        console.error("Error creating user:", error);
        if (error.name === "SequelizeUniqueConstraintError") {
          return next(
            new ErrorHandler("Account already exists with this email", 409)
          );
        }
        throw error;
      }
    } else {
      // Update existing user's Google information within transaction
      await parent.update(
        {
          googleUserId: googlePayload.sub,
          name: parent.name || googlePayload.name,
        },
        { transaction }
      );
    }

    if (!parent.isActive) {
      await transaction.rollback();
      return next(new ErrorHandler("This account has been deactivated", 403));
    }

    // Commit transaction
    await transaction.commit();

    const obj = {
      type: "parent",
      id: parent.id,
      email: parent.email,
      name: parent.name,
    };

    const accessToken = generateToken(obj);

    // Return response
    return res.status(200).json({
      status: true,
      message: "Login successful",
      token: accessToken,
      data: {
        id: parent.id,
        email: parent.email,
        name: parent.name,
        isEmailVerified: parent.isEmailVerified,
      }
    });
  } catch (error) {
    // Ensure transaction is rolled back in case of any unexpected error
    await transaction.rollback();

    // Log and handle errors
    console.error("Google login error:", error);
    return next(
      new ErrorHandler(
        error.message ||
          "An error occurred during login. Please try again later.",
        500
      )
    );
  }
});

// ---------------signup------------------------------------------------
const signup = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { name, countryCode, phone, email, gender, password } = req.body;
    
    // Handle image upload if file is provided
    let imageData = null;
    if (req.file) {
      try {
        const uploadResult = await uploadFile(req.file);
        imageData = {
          url: uploadResult.url,
          filename: uploadResult.filename,
          originalName: uploadResult.originalName,
          size: uploadResult.size,
          mimetype: uploadResult.mimetype
        };
      } catch (uploadError) {
        console.error('Image upload failed:', uploadError);
        return next(new ErrorHandler("Image upload failed", 500));
      }
    }

    // Validation - only check required fields (name, email, password)
    if ([name, email, password].some((field) => field?.trim() === "")) {
      return next(new ErrorHandler("All required fields must be filled", 400));
    }
    
    // Validate input fields
    if (!name) {
      return next(new ErrorHandler("Name is missing", 400));
    }
    if (!email) {
      return next(new ErrorHandler("Email is missing", 400));
    }
    if (!password) {
      return next(new ErrorHandler("Password is missing", 400));
    }
    
    // Sanitize name: trim and reduce multiple spaces to a single space
    name.trim().replace(/\s+/g, " ");
    // Convert the email to lowercase for case-insensitive comparison
    const lowercaseEmail = email.trim().toLowerCase();
    
    // Validate name
    const nameError = isValidLength(name);
    if (nameError) {
      return next(new ErrorHandler(nameError, 400));
    }

    // Validate phone only if both country code and phone are provided
    let cleanedPhone = null;
    let cleanedCountryCode = null;

    if (phone && countryCode) {
      const phoneValidationResult = phoneValidation.validatePhone(
        countryCode,
        phone
      );

      if (!phoneValidationResult.isValid) {
        return next(new ErrorHandler(phoneValidationResult.message, 400));
      }

      cleanedPhone = phoneValidationResult.cleanedPhone;
      cleanedCountryCode = phoneValidationResult.cleanedCode;
    } else if ((phone && !countryCode) || (!phone && countryCode)) {
      // If only one of phone or country code is provided, notify user
      return next(
        new ErrorHandler(
          "Both country code and phone number must be provided together if you want to add a phone",
          400
        )
      );
    }

    if (gender) {
      // Validate recurrence
      const allowedGender = ["male", "female", "other"];
      if (gender && (!gender || !allowedGender.includes(gender))) {
        return next(
          new ErrorHandler("Invalid input. Allowed: male, female, other.", 400)
        );
      }
    }

    // Validate email format
    if (!isValidEmail(lowercaseEmail)) {
      return next(new ErrorHandler("Invalid email", 400));
    }

    // Check only for email uniqueness
    const existingParent = await models.Parent.findOne({
      where: { email: lowercaseEmail },
    });

    if (existingParent) {
      if (existingParent.isEmailVerified) {
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
    const parent = await models.Parent.create(
      {
        email,
        // Only include phone fields if they're provided
        ...(cleanedPhone && cleanedCountryCode
          ? {
              phone: cleanedPhone,
              countryCode: cleanedCountryCode,
            }
          : {}),
        password: hashedPassword,
        name,
        gender,
        image: imageData, // Store image data as JSON
      },
      { transaction }
    );

    await transaction.commit();

    // Remove sensitive data from response
    const parentData = parent.toJSON();
    delete parentData.password;
    delete parentData.otp;
    delete parentData.otpExpire;
    delete parentData.isEmailVerified;
    delete parentData.isActive;
    delete parentData.country;
    delete parentData.currency;

    return res.status(201).json({
      success: true,
      message: "Parent created successfully",
      user: parentData,
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

//-----------send OTP-------------------------------
const sendOtp = asyncHandler(async (req, res, next) => {
  try {
    const { email } = req.body;

    // Check if the email field is provided and not empty after trimming
    if (!email || email.trim() === "") {
      return next(new ErrorHandler("Please provide email", 400));
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return next(new ErrorHandler("Invalid email", 400));
    }

    // Convert the email to lowercase for case-insensitive comparison
    const lowercaseEmail = email.toLowerCase().trim();

    const parent = await models.Parent.findOne({
      where: { email: lowercaseEmail },
    });

    if (!parent) {
      return next(new ErrorHandler("Parent not found", 404));
    }

    const otp = generateOTP();

    /*
      Hi
      To complete your verification, please use the One-Time Password (OTP) provided below.
      This OTP is for single use and will expire after 15 minutes for security reasons.
      Your verification code for Xplore Promote is: {OTP}
      Please do not share this OTP with anyone. If you did not request this, please reach out to our support team immediately.
      Best regards,
      Xplore Promote Team
      */

    // Create HTML content for the email
    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>One-Time Password (OTP) Verification</h2>
      <p>Dear ${parent.name},</p>
      <p>Your verification code for KidsWallet is:</p>
      <h1 style="font-size: 32px; background-color: #f0f0f0; padding: 10px; display: inline-block;">${otp}</h1>
      <p>This code is valid for 10 minutes.</p>
      <p>If you didn't request this code, please ignore this email.</p>
      <p>Best regards,<br>KidsWallet Team</p>
    </div>
  `;
    try {
      await sendEmail({
        email: parent.email,
        subject: `KidsWallet : Your Verification Code`,
        html: htmlContent,
      });

      parent.otp = otp;
      parent.otpExpire = Date.now() + 10 * 60 * 1000; //10 minutes
      await parent.save({ validate: false });

      return res.status(200).json({
        success: true,
        message: `OTP sent to ${parent.email} successfully`,
        email: parent.email,
      });
    } catch (emailError) {
      parent.otp = null;
      parent.otpExpire = null;
      await parent.save({ validate: false });

      console.error("Failed to send OTP email:", emailError);
      return next(new ErrorHandler(error.message, 500));
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});
// -----------------verify OTP------------------------------------------------
const verifyOTP = asyncHandler(async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    // Validate the OTP
    if (!otp || otp.trim() === "") {
      return next(new ErrorHandler("OTP is required.", 400));
    }

    if (!email || email.trim() === "") {
      return next(new ErrorHandler("Please provide email", 400));
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return next(new ErrorHandler("Invalid email", 400));
    }

    // Convert the email to lowercase for case-insensitive comparison
    const lowercaseEmail = email.toLowerCase().trim();

    const parent = await models.Parent.findOne({
      where: { email: lowercaseEmail },
    });
    console.log(parent);

    if (!parent) {
      return next(new ErrorHandler("Parent not found", 404));
    }

    // Check OTP validity
    if (parent.otp !== otp) {
      return next(new ErrorHandler("Invalid OTP", 400));
    }
    if (parent.otpExpire < Date.now()) {
      return next(new ErrorHandler("OTP has expired", 400));
    }

    // Update user details
    parent.isEmailVerified = true;
    parent.otp = null;
    parent.otpExpire = null;
    await parent.save();

    const obj = {
      type: "parent",
      id: parent.id,
      email: parent.email,
      name: parent.name,
    };
    const accessToken = generateToken(obj);

    return res.status(200).json({
      success: true,
      message: "Email verified successfully",
      token: accessToken,
      data: {
        id: parent.id,
        name: parent.name,
        email: parent.email,
      },
    });
  } catch (error) {
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
    const parent = await models.Parent.findOne({
      where: { email: lowercaseEmail },
    });
    if (!parent) {
      return next(new ErrorHandler("Parent not found", 404));
    }

    // Verify password
    const isPasswordMatched = await bcrypt.compare(password, parent.password);
    // console.log("Password match result:", isPasswordMatched);

    if (!isPasswordMatched) {
      return next(new ErrorHandler("Invalid password", 400));
    }

    // Check if user is verified
    if (!parent.isEmailVerified) {
      return next(new ErrorHandler("Please verify your email", 400));
    }

    let obj = {
      type: "parent",
      id: parent.id,
      email: parent.email,
      name: parent.name,
    };

    // Generate token
    const token = generateToken(obj);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: parent.id,
        name: parent.name,
        email: parent.email,
        isEmailVerified: parent.isEmailVerified,
      },
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// ---------------FORGET PASSWORD-----------------------------------------------------
const forgotPassword = asyncHandler(async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || email.trim() === "") {
      return next(new ErrorHandler("Please provide Email", 400));
    }

    if (!isValidEmail(email)) {
      return next(new ErrorHandler("Invalid email", 400));
    }
    // Convert the email to lowercase for case-insensitive comparison
    const lowercaseEmail = email.toLowerCase().trim();
    let parent;
    parent = await models.Parent.findOne({
      where: {
        email: lowercaseEmail,
      },
    });

    if (!parent) {
      return next(new ErrorHandler("Parent not found", 404));
    }
    // if (!user.isEmailVerified) {
    //   return next(new ErrorHandler("User is not verified", 403));
    // }

    // Get ResetPassword Token
    const otp = generateOTP(); // Assuming you have a method to generate the OTP
    parent.otp = otp;
    parent.otpExpire = Date.now() + 10 * 60 * 1000; // Set OTP expiration time (e.g., 15 minutes)

    await parent.save({ validate: false });

    // Create HTML content for the email
    // <img src="https://stream.xircular.io/AIengage.png" alt="AI Engage Logo" style="max-width: 200px; margin-bottom: 20px;">
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>Hello ${parent.name},</p>
        <p>You have requested a password reset for your KidsWallet account.</p>
          <p>Your One Time Password (OTP) for KidsWallet is:</p>
        <h1 style="font-size: 32px; background-color: #f0f0f0; padding: 10px; display: inline-block;">${otp}</h1>
        <p>This OTP is valid for 10 minutes.</p>
        <p>If you didn't request this password reset, please ignore this email.</p>
        <p>Best regards,<br>KidsWallet Team</p>
      </div> 
      `;
    try {
      await sendEmail({
        email: parent.email,
        subject: `KidsWallet: Password Reset Request`,
        html: htmlContent,
      });

      parent.otp = otp;
      parent.otpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

      await parent.save({ validate: false });

      return res.status(200).json({
        success: true,
        message: `Password reset otp sent to ${parent.email}`,
        userId: parent.id,
      });
    } catch (emailError) {
      parent.otp = null;
      parent.otpExpire = null;
      await parent.save({ validate: false });

      console.error("Failed to send OTP email:", emailError);
      return next(new ErrorHandler(emailError.message, 500));
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// ---------------RESET PASSWORD------------------------------------------------------------
const resetPassword = asyncHandler(async (req, res, next) => {
  try {
    const { password, otp, email } = req.body;

    // Validate input fields
    if (!password || password.trim() === "") {
      return next(new ErrorHandler("Missing Password", 400));
    }
    if (!otp || otp.trim() === "") {
      return next(new ErrorHandler("Missing OTP", 400));
    }
    const lowercaseEmail = email.toLowerCase().trim();
    const passwordValidationResult = isValidPassword(password);
    if (passwordValidationResult) {
      return next(new ErrorHandler(passwordValidationResult, 400));
    }
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Find the user by ID
    const parent = await models.Parent.findOne({
      where: {
        email: lowercaseEmail,
      },
    });
    if (!parent) {
      return next(new ErrorHandler("Parent not found", 404));
    }

    // Verify the OTP
    if (parent.otp !== otp.trim()) {
      return next(new ErrorHandler("Invalid OTP", 400));
    }
    if (parent.otpExpire < Date.now()) {
      return next(new ErrorHandler("Expired OTP", 400));
    }

    // Update the user's password and clear OTP fields
    parent.password = hashedPassword;
    parent.otp = null;
    parent.otpExpire = null;
    await parent.save();

    return res.status(200).json({
      success: true,
      message: `Password reset successfully`,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// ------------get parent detail by token------------------------------------------
const getParentDetail = asyncHandler(async (req, res, next) => {
  try {
    const parent = req.parent; // assuming req.parent is a Parent model instance
    // Remove sensitive data from response
    const parentData = parent.toJSON();
    delete parentData.password;
    delete parentData.otp;
    delete parentData.otpExpire;
    return res.status(200).json({
      success: true,
      message: "Parent details retrieved successfully",
      user: parentData,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// --------------get parent detail by id------------------------------------------
const getParentDetailById = asyncHandler(async (req, res, next) => {
  try {
    const parentId = req.params.parentId; // assuming parentId is passed as a URL parameter
    const parent = await models.Parent.findByPk(parentId, {
      attributes: {
        exclude: ["password", "otp", "otpExpire"],
      },
    });
    if (!parent) {
      return next(new ErrorHandler("Parent not found", 404));
    }
    // Remove sensitive data from response
    const parentData = parent.toJSON();
    delete parentData.password;
    delete parentData.otp;
    delete parentData.otpExpire;
    return res.status(200).json({
      success: true,
      message: "Parent details retrieved successfully",
      user: parentData,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

//-------update parent profile-------------------------------------------------------------
const updateProfile = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const allowedFields = ["name", "country", "currency"];
    const parent = req.parent;
    
    // Handle image upload if file is provided
    let imageData = parent.image; // Keep existing image by default
    if (req.file) {
      try {
        // Delete old image if it exists
        if (parent.image && parent.image.filename) {
          try {
            await deleteFile(parent.image.filename);
          } catch (deleteError) {
            console.warn('Failed to delete old image:', deleteError.message);
            // Continue with upload even if delete fails
          }
        }
        
        // Upload new image
        const uploadResult = await uploadFile(req.file);
        imageData = {
          url: uploadResult.url,
          filename: uploadResult.filename,
          originalName: uploadResult.originalName,
          size: uploadResult.size,
          mimetype: uploadResult.mimetype
        };
      } catch (uploadError) {
        await transaction.rollback();
        console.error('Image upload failed:', uploadError);
        return next(new ErrorHandler("Image upload failed", 500));
      }
    }

    // Filter and validate incoming fields
    const inputKeys = Object.keys(req.body);
    const invalidFields = inputKeys.filter(
      (key) => !allowedFields.includes(key)
    );

    if (invalidFields.length > 0) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          `Invalid fields in request: ${invalidFields.join(", ")}`,
          400
        )
      );
    }
    
    // Sanitize and validate 'name' if present
    if (req.body.name) {
      const sanitizedName = req.body.name.trim().replace(/\s+/g, " ");
      const nameError = isValidLength(sanitizedName);
      if (nameError) {
        await transaction.rollback();
        return next(new ErrorHandler(nameError, 400));
      }
      parent.name = sanitizedName;
    }

    // Update only allowed fields if they exist
    if (req.body.country) parent.country = req.body.country;
    if (req.body.currency) parent.currency = req.body.currency;
    
    // Update image data
    parent.image = imageData;

    await parent.save({ transaction });
    await transaction.commit();

    const parentData = parent.toJSON();
    delete parentData.password;
    delete parentData.otp;
    delete parentData.otpExpiry;

    return res.json({
      message: "Profile updated successfully",
      user: parentData,
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

//--------------------create child profile--------------------------------------------------
const createChild = asyncHandler(async (req, res, next) => {
  try {
    const parentId = req.parent.id;
    const {
      name,
      age,
      username,
      gender,
      password,
      hasBlogAccess,
      deviceSharingMode,
    } = req.body;
    
    // Handle profile picture upload if file is provided
    let profilePictureData = null;
    if (req.file) {
      try {
        const uploadResult = await uploadFile(req.file);
        profilePictureData = {
          url: uploadResult.url,
          filename: uploadResult.filename,
          originalName: uploadResult.originalName,
          size: uploadResult.size,
          mimetype: uploadResult.mimetype
        };
      } catch (uploadError) {
        console.error('Profile picture upload failed:', uploadError);
        return next(new ErrorHandler("Profile picture upload failed", 500));
      }
    }
    
    // Sanitize name: trim and reduce multiple spaces to a single space
    const sanitizedName = name.trim().replace(/\s+/g, " ");
    const sanatizedUsername = username.trim().replace(/\s+/g, " ");
    console.log("sanatizeUsername", sanatizedUsername);

    // Validate name
    const nameError = isValidLength(sanitizedName);
    if (nameError) {
      return next(new ErrorHandler(nameError, 400));
    }
    const usernameError = isValidUsernameLength(sanatizedUsername);
    if (usernameError) {
      console.log("usernameError", usernameError);
      return next(new ErrorHandler(usernameError, 400));
    }
    if (gender) {
      // Validate recurrence
      const allowedGender = ["male", "female", "other"];
      if (gender && (!gender || !allowedGender.includes(gender))) {
        return next(
          new ErrorHandler("Invalid input. Allowed: male, female, other.", 400)
        );
      }
    }
    // Validate the password and create a new user
    const passwordValidationResult = isValidPassword(password);
    if (passwordValidationResult) {
      return next(new ErrorHandler(passwordValidationResult, 400));
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    // Validate parent exists
    const parent = await models.Parent.findByPk(parentId);
    if (!parent) {
      return next(new ErrorHandler("Parent not found", 404));
    }

    // Check if username already exists
    const existingChild = await models.Child.findOne({
      where: { username: sanatizedUsername },
    });
    if (existingChild) {
      return next(new ErrorHandler("Username already taken", 400));
    }

    // Create child account
    const newChild = await models.Child.create({
      name: sanitizedName,
      age,
      gender,
      profilePicture: profilePictureData, // Store as JSON
      username: sanatizedUsername,
      password: hashedPassword || null,
      parentId,
      hasBlogAccess: hasBlogAccess || false,
      deviceSharingMode: deviceSharingMode || false,
    });

    // Create initial streak record
    await models.Streak.create({
      childId: newChild.id,
      currentStreak: 0,
    });

    return res.status(201).json({
      success: true,
      message: "Child account created successfully",
      data: {
        id: newChild.id,
        name: newChild.name,
        age: newChild.age,
        username: newChild.username,
        gender: newChild.gender,
        profilePicture: newChild.profilePicture,
        hasBlogAccess: newChild.hasBlogAccess,
        deviceSharingMode: newChild.deviceSharingMode,
      },
    });
  } catch (error) {
    console.error("Error creating child account:", error);
    return next(
      new ErrorHandler(error.message || "Failed to create child account", 500)
    );
  }
});

// -----------------get all children--------------------------------
const getAllChildren = asyncHandler(async (req, res, next) => {
  try {
    const parentId = req.parent.id;

    const parent = await models.Parent.findByPk(parentId, {
      include: [
        {
          model: models.Child,
          as: "children",
          attributes: [
            "id",
            "username",
            "name",
            "age",
            "gender",
            "profilePicture",
            "coinBalance",
            "hasBlogAccess",
            "isPublicAccount",
            "deviceSharingMode",
            "createdAt",
            "updatedAt",
          ],
        },
      ],
    });

    if (!parent) {
      return next(new ErrorHandler("Parent not found", 404));
    }

    return res.status(200).json({
      success: true,
      children: parent.children,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// -------------get specific child------------------------
const getChildById = asyncHandler(async (req, res, next) => {
  try {
    const childId = req.params.childId; // assuming childId is passed as a URL parameter
    const parentId = req.parent.id;

    const child = await models.Child.findOne({
      where: { id: childId, parentId },
      attributes: [
        "id",
        "username",
        "name",
        "age",
        "gender",
        "profilePicture",
        "coinBalance",
        "hasBlogAccess",
        "isPublicAccount",
        "deviceSharingMode",
        "createdAt",
        "updatedAt",
      ],
    });

    if (!child) {
      return next(new ErrorHandler("Child not found", 404));
    }

    return res.status(200).json({
      success: true,
      message: "Child details retrieved successfully",
      data: child,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// --------update child profile--------------------------------------
const updateChildProfile = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const parent = req.parent;
    const { childId } = req.params;
    const updateData = req.body;

    const child = await models.Child.findOne({
      where: { id: childId },
      transaction,
    });

    if (!child) {
      await transaction.rollback();
      return next(new ErrorHandler("Child not found", 404));
    }

    // ✅ Check that the child belongs to the logged-in parent
    if (child.parentId !== parent.id) {
      await transaction.rollback();
      return next(
        new ErrorHandler(
          "You are not authorized to update this child's profile",
          403
        )
      );
    }
    
    // Handle profile picture upload if file is provided
    let profilePictureData = child.profilePicture; // Keep existing image by default
    if (req.file) {
      try {
        // Delete old profile picture if it exists
        if (child.profilePicture && child.profilePicture.filename) {
          try {
            await deleteFile(child.profilePicture.filename);
          } catch (deleteError) {
            console.warn('Failed to delete old profile picture:', deleteError.message);
            // Continue with upload even if delete fails
          }
        }
        
        // Upload new profile picture
        const uploadResult = await uploadFile(req.file);
        profilePictureData = {
          url: uploadResult.url,
          filename: uploadResult.filename,
          originalName: uploadResult.originalName,
          size: uploadResult.size,
          mimetype: uploadResult.mimetype
        };
      } catch (uploadError) {
        await transaction.rollback();
        console.error('Profile picture upload failed:', uploadError);
        return next(new ErrorHandler("Profile picture upload failed", 500));
      }
    }

    // Prevent updating coinBalance
    if (updateData.coinBalance !== undefined) {
      await transaction.rollback();
      return next(
        new ErrorHandler("You cannot update coinBalance directly", 400)
      );
    }

    // Username validation
    if (typeof updateData.username === "string") {
      const username = updateData.username.trim();
      if (!username) {
        await transaction.rollback();
        return next(
          new ErrorHandler("Username cannot be empty or whitespace", 400)
        );
      }

      // Check if username is unique (excluding current child)
      const existingUser = await models.Child.findOne({
        where: {
          username,
          id: { [Op.ne]: child.id },
        },
        transaction,
      });

      if (existingUser) {
        await transaction.rollback();
        return next(new ErrorHandler("Username already taken", 400));
      }

      child.username = username;
    }

    // Name validation
    if (typeof updateData.name === "string") {
      const sanitizedName = updateData.name.trim().replace(/\s+/g, " ");
      if (!sanitizedName) {
        await transaction.rollback();
        return next(
          new ErrorHandler("Name cannot be empty or whitespace", 400)
        );
      }
      const nameError = isValidLength(sanitizedName);
      if (nameError) {
        await transaction.rollback();
        return next(new ErrorHandler(nameError, 400));
      }
      child.name = sanitizedName;
    }

    // Age validation
    if (updateData.age !== undefined) {
      const age = parseInt(updateData.age, 10);
      if (isNaN(age) || age < 5 || age > 16) {
        await transaction.rollback();
        return next(
          new ErrorHandler("Age must be a number between 5 and 16", 400)
        );
      }
      child.age = age;
    }

    // Gender validation
    if (updateData.gender !== undefined) {
      if (!["male", "female", "other"].includes(updateData.gender)) {
        await transaction.rollback();
        return next(
          new ErrorHandler("Gender must be male, female, or other", 400)
        );
      }
      child.gender = updateData.gender;
    }

    // Profile Picture
    if (typeof updateData.profilePicture === "string") {
      child.profilePicture = updateData.profilePicture;
    }

    // Boolean fields
    if (updateData.hasBlogAccess !== undefined) {
      if (typeof updateData.hasBlogAccess !== "boolean") {
        await transaction.rollback();
        return next(new ErrorHandler("hasBlogAccess must be a boolean", 400));
      }
      child.hasBlogAccess = updateData.hasBlogAccess;
    }

    if (updateData.isPublicAccount !== undefined) {
      if (typeof updateData.isPublicAccount !== "boolean") {
        await transaction.rollback();
        return next(new ErrorHandler("isPublicAccount must be a boolean", 400));
      }
      child.isPublicAccount = updateData.isPublicAccount;
    }

    if (updateData.deviceSharingMode !== undefined) {
      if (typeof updateData.deviceSharingMode !== "boolean") {
        await transaction.rollback();
        return next(
          new ErrorHandler("deviceSharingMode must be a boolean", 400)
        );
      }
      child.deviceSharingMode = updateData.deviceSharingMode;
    }

    await child.save({ transaction });
    await transaction.commit();

    const childData = child.toJSON();
    delete childData.password;

    return res.json({
      message: "Child profile updated successfully",
      child: childData,
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

// -----------------get all notifications--------------------------------
const getParentNotifications = asyncHandler(async (req, res, next) => {
  try {
    const parentId = req.parent.id;
    
    // Extract query parameters
    const {
      page = 1,
      limit = 10,
      type,
      isRead,
      relatedItemType,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    // Calculate offset for pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause
    const whereClause = {
      recipientId: parentId,
      recipientType: "parent"
    };

    // Apply filters
    if (type) {
      whereClause.type = type;
    }

    if (isRead !== undefined) {
      whereClause.isRead = isRead === 'true';
    }

    if (relatedItemType) {
      whereClause.relatedItemType = relatedItemType;
    }

    // Date range filter
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        whereClause.createdAt[Op.lte] = new Date(endDate);
      }
    }

    // Validate sort parameters
    const allowedSortFields = ['createdAt', 'updatedAt', 'type', 'isRead'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    // Find notifications with pagination
    const { count, rows: notifications } = await models.Notification.findAndCountAll({
      where: whereClause,
      order: [[sortField, sortDirection]],
      limit: parseInt(limit),
      offset: offset,
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(count / parseInt(limit));
    const hasNextPage = parseInt(page) < totalPages;
    const hasPrevPage = parseInt(page) > 1;

    return res.status(200).json({
      success: true,
      message: "Notifications retrieved successfully",
      data: notifications,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: count,
        itemsPerPage: parseInt(limit),
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? parseInt(page) + 1 : null,
        prevPage: hasPrevPage ? parseInt(page) - 1 : null
      },
      filters: {
        type,
        isRead,
        relatedItemType,
        startDate,
        endDate,
        sortBy: sortField,
        sortOrder: sortDirection
      }
    });
  } catch (error) {
    console.error("Error retrieving notifications:", error);
    return next(
      new ErrorHandler(error.message || "Failed to retrieve notifications", 500)
    );
  }
});

// -----------------delete user by email--------------------------------
const deleteUserByEmail = asyncHandler(async (req, res, next) => {
  try {
    const { email } = req.query;

    if (!email || email.trim() === "") {
      return next(new ErrorHandler("Email is required", 400));
    }

    const lowercaseEmail = email.trim().toLowerCase();

    const user = await models.Parent.findOne({
      where: { email: lowercaseEmail },
    });

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    await user.destroy();

    return res.status(200).json({
      message: "User deleted successfully",
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// -----------------delete child account--------------------------------
const deleteChldAccount = asyncHandler(async (req, res, next) => {
  try {
    const childId = req.query.childId;
    const parentId = req.parent.id;

    // Find the child account
    const child = await models.Child.findOne({
      where: { id: childId, parentId },
    });

    if (!child) {
      return next(new ErrorHandler("Child not found", 404));
    }

    // Delete the child account
    await child.destroy();

    return res.status(200).json({
      message: "Child account deleted successfully",
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

//---------- Delete parent profile----------------------
const deleteProfile = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const parent = req.parent; // assuming req.parent is a Parent model instance

    await parent.destroy({ transaction }); // CASCADE delete happens here

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Parent deleted successfully",
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

module.exports = {
  googleLogin,
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
};
