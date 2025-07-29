const bcrypt = require("bcrypt");
const models = require("../Modals/index");
const db = require("../Configs/db/DbConfig");
const { Op, literal } = require("sequelize");
const sequelize = db.sequelize;
const {
  generateToken,
  generateOTP,
  verifyGoogleLogin,
  getDateRange,
  getTimeSeriesData,
} = require("../Utils/parentHelper");
const { phoneValidation } = require("../Utils/phoneValidation");
const {
  validateCurrencyCountry,
  COUNTRY_CURRENCY_MAP,
} = require("../Validators/countryCurrencyValidation");
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
      transaction,
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
            tokenVersion: 0, // Initialize tokenVersion for new users
          },
          { transaction }
        );
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

    // Create user object for token
    const userObj = {
      type: "parent",
      id: parent.id,
      email: parent.email,
      name: parent.name,
      tokenVersion: parent.tokenVersion || 0, // Include tokenVersion
    };

    // Generate token
    const accessToken = generateToken(userObj);

    // Check if token generation failed
    if (accessToken && !accessToken.success && accessToken.status === 500) {
      return next(new ErrorHandler(accessToken.message, 500));
    }

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
      },
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
          mimetype: uploadResult.mimetype,
        };
      } catch (uploadError) {
        console.error("Image upload failed:", uploadError);
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
      return next(new ErrorHandler(`name ${nameError}`, 400));
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
        email: lowercaseEmail,
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
      <p>Your verification code for Kita is:</p>
      <h1 style="font-size: 32px; background-color: #f0f0f0; padding: 10px; display: inline-block;">${otp}</h1>
      <p>This code is valid for 10 minutes.</p>
      <p>If you didn't request this code, please ignore this email.</p>
      <p>Best regards,<br>Kita Team</p>
    </div>
  `;
    try {
      await sendEmail({
        email: parent.email,
        subject: `Kita : Your Verification Code`,
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
    parent.isActive = true;
    parent.otp = null;
    parent.otpExpire = null;
    await parent.save();

    // Create user object for token
    const userObj = {
      type: "parent",
      id: parent.id,
      email: parent.email,
      name: parent.name,
      tokenVersion: parent.tokenVersion || 0, // Include tokenVersion
    };

    // Generate token
    const accessToken = generateToken(userObj);

    // Check if token generation failed
    if (accessToken && !accessToken.success && accessToken.status === 500) {
      return next(new ErrorHandler(accessToken.message, 500));
    }

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

    if (!isPasswordMatched) {
      return next(new ErrorHandler("Invalid password", 400));
    }

    // Check if user is verified
    if (!parent.isEmailVerified) {
      return next(new ErrorHandler("Please verify your email", 400));
    }

    // Create user object for token
    const userObj = {
      type: "parent",
      id: parent.id,
      email: parent.email,
      name: parent.name,
      tokenVersion: parent.tokenVersion || 0, // Include tokenVersion
    };

    // Generate token - handle both success and error cases
    const token = generateToken(userObj);

    // Check if token generation failed
    if (token && !token.success && token.status === 500) {
      return next(new ErrorHandler(token.message, 500));
    }

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
        <p>You have requested a password reset for your Kita account.</p>
          <p>Your One Time Password (OTP) for Kita is:</p>
        <h1 style="font-size: 32px; background-color: #f0f0f0; padding: 10px; display: inline-block;">${otp}</h1>
        <p>This OTP is valid for 10 minutes.</p>
        <p>If you didn't request this password reset, please ignore this email.</p>
        <p>Best regards,<br>Kita Team</p>
      </div> 
      `;
    try {
      await sendEmail({
        email: parent.email,
        subject: `Kita: Password Reset Request`,
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

    // Find the user by email
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

    // CRITICAL: Increment tokenVersion to invalidate all existing tokens
    const newTokenVersion = (parent.tokenVersion || 0) + 1;

    // Update the user's password, increment tokenVersion, and clear OTP fields
    await parent.update({
      password: hashedPassword,
      tokenVersion: newTokenVersion, // This invalidates all existing tokens
      otp: null,
      otpExpire: null,
    });

    return res.status(200).json({
      success: true,
      message:
        "Password reset successfully. Please login with your new password.",
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
    const allowedFields = ["name", "country", "currency", "image"];
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
            console.warn("Failed to delete old image:", deleteError.message);
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
          mimetype: uploadResult.mimetype,
        };
      } catch (uploadError) {
        await transaction.rollback();
        console.error("Image upload failed:", uploadError);
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

    // Prepare values for validation
    const newCountry = req.body.country || parent.country;
    const newCurrency = req.body.currency || parent.currency;

    // Validate currency-country combination
    if (newCountry && newCurrency) {
      if (!validateCurrencyCountry(newCountry, newCurrency)) {
        await transaction.rollback();
        const validCurrencies = COUNTRY_CURRENCY_MAP[newCountry.toUpperCase()];
        const errorMessage = validCurrencies
          ? `Invalid currency '${newCurrency}' for country '${newCountry}'. Valid currencies are: ${validCurrencies.join(
              ", "
            )}`
          : `Country '${newCountry}' is not supported`;
        return next(new ErrorHandler(errorMessage, 400));
      }
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
    if (!transaction.finished) {
      await transaction.rollback();
    }
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

    // Validate required fields first
    if (!name || !username) {
      return next(new ErrorHandler("Name and username are required", 400));
    }

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
          mimetype: uploadResult.mimetype,
        };
      } catch (uploadError) {
        console.error("Profile picture upload failed:", uploadError);
        return next(new ErrorHandler("Profile picture upload failed", 500));
      }
    }

    // Sanitize name: trim and reduce multiple spaces to a single space
    const sanitizedName = name.trim().replace(/\s+/g, " ");
    // Sanitize username: trim and remove all spaces (usernames shouldn't have spaces)
    const sanitizedUsername = username.trim().replace(/\s+/g, "");
    console.log("sanitizedUsername", sanitizedUsername);

    // Validate name
    const nameError = isValidLength(sanitizedName);
    if (nameError) {
      return next(new ErrorHandler(nameError, 400));
    }

    // Validate username
    const usernameError = isValidUsernameLength(sanitizedUsername);
    if (usernameError) {
      console.log("usernameError", usernameError);
      return next(new ErrorHandler(usernameError, 400));
    }

    // Validate age
    if (!age) {
      return next(new ErrorHandler("Age is required", 400));
    }

    const ageNumber = parseInt(age);
    if (isNaN(ageNumber)) {
      return next(new ErrorHandler("Age must be a valid number", 400));
    }

    if (ageNumber < 5 || ageNumber > 16) {
      return next(new ErrorHandler("Age must be between 5 and 16 years", 400));
    }

    // Validate gender
    if (gender) {
      const allowedGender = ["male", "female", "other"];
      if (!allowedGender.includes(gender)) {
        return next(
          new ErrorHandler("Invalid input. Allowed: male, female, other.", 400)
        );
      }
    }

    // Validate the password logic strictly:
    // If deviceSharingMode is false, password is required
    // If deviceSharingMode is true, password should not be provided
    if (deviceSharingMode === "false" && (!password || password.trim() === "")) {
      return next(
        new ErrorHandler("Password is required when device sharing is disabled", 400)
      );
    }
    
    // If deviceSharingMode is true and password is provided, reject it
    if (deviceSharingMode === "true" && password && password.trim() !== "") {
      return next(
        new ErrorHandler("Password should not be provided when device sharing is enabled", 400)
      );
    }
    
    let hashedPassword = null;
    // Hash password only if deviceSharingMode is false and password is provided
    if (deviceSharingMode === "false" && password && password.trim() !== "") {
      // Validate password
      const passwordValidationResult = isValidPassword(password);
      if (passwordValidationResult) {
        return next(new ErrorHandler(passwordValidationResult, 400));
      }

      // Hash password
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Validate parent exists
    const parent = await models.Parent.findByPk(parentId);
    if (!parent) {
      return next(new ErrorHandler("Parent not found", 404));
    }

    // Check if username already exists
    const existingChild = await models.Child.findOne({
      where: { username: sanitizedUsername },
    });
    if (existingChild) {
      return next(
        new ErrorHandler(
          "Username already taken. Please choose a different username",
          400
        )
      );
    }

    // Create child account
    const newChild = await models.Child.create({
      name: sanitizedName,
      age: ageNumber, // Use the validated number
      gender,
      profilePicture: profilePictureData, // Store as JSON
      username: sanitizedUsername,
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

// Alternative version with more detailed filtering options and pagination
const getAllChildren = asyncHandler(async (req, res, next) => {
  try {
    // Check if admin is making the request
    // if (!req.admin || !req.parent) {
    //   return next(
    //     new ErrorHandler("Unauthorized access.", 401)
    //   );
    // }

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Optional query parameters for filtering
    const {
      minAge,
      maxAge,
      gender,
      minGoalCompletion,
      minTaskCompletion,
      parentId,
      search,
      sortBy = "createdAt",
      sortOrder = "DESC",
    } = req.query;

    let whereClause = {};

    if (minAge || maxAge) {
      whereClause.age = {};
      if (minAge) whereClause.age[Op.gte] = parseInt(minAge);
      if (maxAge) whereClause.age[Op.lte] = parseInt(maxAge);
    }

    if (gender) {
      whereClause.gender = gender;
    }
    if (req.parent) {
      whereClause.parentId = req.parent.id;
    }

    if (!req.parent && parentId) {
      if (parentId) {
        whereClause.parentId = parentId;
      }
    }

    // Search functionality
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { username: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // Validate sortBy field
    const allowedSortFields = [
      "name",
      "age",
      "createdAt",
      "updatedAt",
      "coinBalance",
      "username",
    ];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = ["ASC", "DESC"].includes(sortOrder.toUpperCase())
      ? sortOrder.toUpperCase()
      : "DESC";

    // Get total count for pagination (before applying limit/offset)
    const totalCount = await models.Child.count({
      where: whereClause,
    });

    const children = await models.Child.findAll({
      where: whereClause,
      limit: limit,
      offset: offset,
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
      include: [
        {
          model: models.Parent,
          as: "parent",
          attributes: ["id", "name", "email"],
        },
        {
          model: models.Goal,
          as: "goals",
          attributes: [
            "id",
            "title",
            "status",
            "type",
            "completedAt",
            "approvedAt",
          ],
        },
        {
          model: models.Task,
          as: "Tasks", // Changed from "Task" to "Tasks" to match the response
          attributes: [
            "id",
            "status",
            "completedAt",
            "approvedAt",
            "rewardCoins",
          ],
          include: [
            {
              model: models.TaskTemplate,
              attributes: ["id", "title"],
            },
          ],
        },
      ],
      order: [[sortField, sortDirection]],
    });

    // Transform and filter based on completion rates if specified
    let childrenWithStats = children.map((child) => {
      const childData = child.toJSON();

      const totalGoals = childData.goals ? childData.goals.length : 0;
      const completedGoals = childData.goals
        ? childData.goals.filter(
            (goal) => goal.status === "COMPLETED" || goal.status === "APPROVED"
          ).length
        : 0;
      const goalsCompletionPercentage =
        totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

      // Calculate task (chores) statistics
      const totalTasks = childData.Tasks ? childData.Tasks.length : 0;
      const completedTasks = childData.Tasks
        ? childData.Tasks.filter(
            (task) => task.status === "COMPLETED" || task.status === "APPROVED"
          ).length
        : 0;
      const tasksCompletionPercentage =
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      return {
        ...childData,
        goalsStats: {
          completed: completedGoals,
          total: totalGoals,
          completionPercentage: goalsCompletionPercentage,
          displayText: `${completedGoals}/${totalGoals}`,
        },
        tasksStats: {
          completed: completedTasks,
          total: totalTasks,
          completionPercentage: tasksCompletionPercentage,
          displayText: `${completedTasks}/${totalTasks}`,
        },
        goals: undefined,
        Tasks: undefined, // Changed from Task to Tasks
      };
    });

    // Apply completion rate filters after getting the data (since these are calculated fields)
    if (minGoalCompletion) {
      childrenWithStats = childrenWithStats.filter(
        (child) =>
          child.goalsStats.completionPercentage >= parseInt(minGoalCompletion)
      );
    }

    if (minTaskCompletion) {
      childrenWithStats = childrenWithStats.filter(
        (child) =>
          child.tasksStats.completionPercentage >= parseInt(minTaskCompletion)
      );
    }

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return res.status(200).json({
      success: true,
      children: childrenWithStats,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalCount,
        itemsPerPage: limit,
        hasNextPage: hasNextPage,
        hasPrevPage: hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null,
        startIndex: offset + 1,
        endIndex: Math.min(offset + limit, totalCount),
      },
      filters: {
        minAge,
        maxAge,
        gender,
        minGoalCompletion,
        minTaskCompletion,
        parentId,
        search,
        sortBy: sortField,
        sortOrder: sortDirection,
      },
      summary: {
        totalChildrenInDatabase: totalCount,
        childrenOnCurrentPage: childrenWithStats.length,
        averageGoalCompletion:
          childrenWithStats.length > 0
            ? Math.round(
                childrenWithStats.reduce(
                  (sum, child) => sum + child.goalsStats.completionPercentage,
                  0
                ) / childrenWithStats.length
              )
            : 0,
        averageTaskCompletion:
          childrenWithStats.length > 0
            ? Math.round(
                childrenWithStats.reduce(
                  (sum, child) => sum + child.tasksStats.completionPercentage,
                  0
                ) / childrenWithStats.length
              )
            : 0,
      },
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
            console.warn(
              "Failed to delete old profile picture:",
              deleteError.message
            );
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
          mimetype: uploadResult.mimetype,
        };
      } catch (uploadError) {
        await transaction.rollback();
        console.error("Profile picture upload failed:", uploadError);
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
      sortBy = "createdAt",
      sortOrder = "DESC",
    } = req.query;

    // Calculate offset for pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause
    const whereClause = {
      recipientId: parentId,
      recipientType: "parent",
    };

    // Apply filters
    if (type) {
      whereClause.type = type;
    }

    if (isRead !== undefined) {
      whereClause.isRead = isRead === "true";
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
    const allowedSortFields = ["createdAt", "updatedAt", "type", "isRead"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = ["ASC", "DESC"].includes(sortOrder.toUpperCase())
      ? sortOrder.toUpperCase()
      : "DESC";

    // Find notifications with pagination
    const { count, rows: notifications } =
      await models.Notification.findAndCountAll({
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
        prevPage: hasPrevPage ? parseInt(page) - 1 : null,
      },
      filters: {
        type,
        isRead,
        relatedItemType,
        startDate,
        endDate,
        sortBy: sortField,
        sortOrder: sortDirection,
      },
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

// Main Analytics Controller
const getParentAnalytics = async (req, res) => {
  try {
    const { parentId } = req.params;
    const { childId, timeFilter = "week" } = req.query;

    // Validate parent exists
    const parent = await models.Parent.findByPk(parentId);
    if (!parent) {
      return res.status(404).json({
        success: false,
        message: "Parent not found",
      });
    }

    // 1. Total chores/tasks created by parent
    const totalChoresCreated = await models.Task.count({
      where: { parentId },
    });

    // 2. Total goals created by parent (goals now have direct parentId)
    const totalGoalsCreated = await models.Goal.count({
      where: { parentId },
    });

    // 3. Get all children of this parent
    const children = await models.Child.findAll({
      where: { parentId },
      include: [
        {
          model: models.Task,
          required: false,
          attributes: ["id", "status"],
        },
        {
          model: models.Goal,
          as: "goals",
          required: false,
          attributes: ["id", "status"],
        },
      ],
    });

    // Process children data
    const childrenAnalytics = children.map((child) => {
      const tasks = child.Tasks || [];
      const goals = child.goals || [];

      return {
        id: child.id,
        name: child.name,
        age: child.age,
        username: child.username,
        profilePicture: child.profilePicture,
        coinBalance: child.coinBalance,
        taskStats: {
          completed: tasks.filter((t) => t.status === "COMPLETED").length,
          pending: tasks.filter((t) => t.status === "PENDING").length,
          overdue: tasks.filter((t) => t.status === "OVERDUE").length,
          rejected: tasks.filter((t) => t.status === "REJECTED").length,
          approved: tasks.filter((t) => t.status === "APPROVED").length,
          total: tasks.length,
        },
        goalStats: {
          completed: goals.filter((g) => g.status === "COMPLETED").length,
          pending: goals.filter((g) => g.status === "PENDING").length,
          rejected: goals.filter((g) => g.status === "REJECTED").length,
          approved: goals.filter((g) => g.status === "APPROVED").length,
          total: goals.length,
        },
      };
    });

    // Filter by specific child if requested
    const selectedChildData = childId
      ? childrenAnalytics.find((child) => child.id === childId)
      : null;

    // 4. Task approval/rejection analytics over time
    const taskAnalytics = await getTimeSeriesData(
      parentId,
      "Task",
      "status",
      timeFilter
    );

    // 5. Goal approval/rejection analytics over time
    const goalAnalytics = await getTimeSeriesData(
      parentId,
      "Goal",
      "status",
      timeFilter
    );

    // Additional summary statistics
    const summaryStats = {
      totalTasks: {
        pending: await models.Task.count({
          where: { parentId, status: "PENDING" },
        }),
        completed: await models.Task.count({
          where: { parentId, status: "COMPLETED" },
        }),
        approved: await models.Task.count({
          where: { parentId, status: "APPROVED" },
        }),
        rejected: await models.Task.count({
          where: { parentId, status: "REJECTED" },
        }),
        overdue: await models.Task.count({
          where: { parentId, status: "OVERDUE" },
        }),
      },
      totalGoals: {
        pending: await models.Goal.count({
          where: { parentId, status: "PENDING" },
        }),
        completed: await models.Goal.count({
          where: { parentId, status: "COMPLETED" },
        }),
        approved: await models.Goal.count({
          where: { parentId, status: "APPROVED" },
        }),
        rejected: await models.Goal.count({
          where: { parentId, status: "REJECTED" },
        }),
      },
    };

    res.status(200).json({
      success: true,
      data: {
        parentInfo: {
          id: parent.id,
          name: parent.name,
          email: parent.email,
          image: parent.image,
          joinedAt: parent.createdAt,
          totalChoresCreated,
          totalGoalsCreated,
        },
        children: childrenAnalytics,
        selectedChild: selectedChildData,
        taskAnalytics,
        goalAnalytics,
        summaryStats,
        filters: {
          appliedTimeFilter: timeFilter,
          selectedChildId: childId || null,
        },
      },
    });
  } catch (error) {
    console.error("Error in getParentAnalytics:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get specific child analytics
const getChildAnalytics = async (req, res) => {
  try {
    const { parentId, childId } = req.params;

    const child = await models.Child.findOne({
      where: { id: childId, parentId },
      include: [
        {
          model: models.Task,
          required: false,
        },
        {
          model: models.Goal,
          as: "goals",
          required: false,
        },
        {
          model: models.Streak,
          required: false,
        },
      ],
    });

    if (!child) {
      return res.status(404).json({
        success: false,
        message: "Child not found",
      });
    }

    const tasks = child.Tasks || [];
    const goals = child.goals || [];

    res.status(200).json({
      success: true,
      data: {
        childInfo: {
          id: child.id,
          name: child.name,
          age: child.age,
          username: child.username,
          profilePicture: child.profilePicture,
          coinBalance: child.coinBalance,
        },
        taskStats: {
          completed: tasks.filter((t) => t.status === "COMPLETED").length,
          pending: tasks.filter((t) => t.status === "PENDING").length,
          overdue: tasks.filter((t) => t.status === "OVERDUE").length,
          rejected: tasks.filter((t) => t.status === "REJECTED").length,
          approved: tasks.filter((t) => t.status === "APPROVED").length,
          total: tasks.length,
        },
        goalStats: {
          completed: goals.filter((g) => g.status === "COMPLETED").length,
          pending: goals.filter((g) => g.status === "PENDING").length,
          rejected: goals.filter((g) => g.status === "REJECTED").length,
          approved: goals.filter((g) => g.status === "APPROVED").length,
          total: goals.length,
        },
        streak: child.Streak,
      },
    });
  } catch (error) {
    console.error("Error in getChildAnalytics:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getAllParents = asyncHandler(async (req, res, next) => {
  try {
    // Check if admin is making the request
    if (!req.admin) {
      return next(
        new ErrorHandler("Unauthorized access. Admin privileges required", 401)
      );
    }

    // Extract pagination parameters from query
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Validate pagination parameters
    if (page < 1) {
      return next(new ErrorHandler("Page number must be greater than 0", 400));
    }
    if (limit < 1 || limit > 100) {
      return next(new ErrorHandler("Limit must be between 1 and 100", 400));
    }

    // Get total count for pagination metadata
    const totalCount = await models.Parent.count();

    // Fetch parents with pagination
    const parents = await models.Parent.findAll({
      attributes: [
        "id",
        "name",
        "email",
        "isEmailVerified",
        "country",
        "currency",
        "image",
        "isActive",
        "createdAt",
        "updatedAt",
      ],
      include: [
        {
          model: models.Child,
          as: "children",
          attributes: ["id"], // Only get child IDs to count them
        },
      ],
      limit,
      offset,
      order: [["createdAt", "DESC"]], // Optional: order by creation date
    });

    // Transform the data to include child count
    const parentsWithChildCount = parents.map((parent) => {
      const parentData = parent.toJSON();
      return {
        ...parentData,
        childCount: parentData.children ? parentData.children.length : 0,
        children: undefined, // Remove children array from response
      };
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return res.status(200).json({
      success: true,
      parents: parentsWithChildCount,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null,
      },
    });
  } catch (error) {
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
  getParentAnalytics,
  getChildAnalytics,
  getAllParents,
};
