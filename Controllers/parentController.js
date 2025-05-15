const bcrypt = require("bcrypt");
const BaseController = require("./index");
const models = require("../Modals/index");
const db = require("../Configs/db/DbConfig");
const sequelize = db.sequelize;
const { Op } = require("sequelize");
const {
  generateToken,
  generateOTP,
  calculateNextDueDate,
} = require("../Utils/parentHelper");
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
const { authenticateToken ,authenticateChildToken} = require("../Middlewares/auth");

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

class ParentController extends BaseController {
  constructor() {
    // Pass the User model to the parent BaseController
    super(models.Parent);

    // Add custom routes in addition to base routes
    this.router.post("/auth/signup", this.signup.bind(this));
    this.router.post("/auth/login", this.login.bind(this));
    this.router.post("/auth/send-otp", this.sendOtp.bind(this));
    this.router.post("/auth/verify-otp", this.verifyOTP.bind(this));
    this.router.post("/forgot-password", this.forgotPassword.bind(this));
    this.router.post("/reset-password", this.resetPassword.bind(this));
    this.router.post(
      "/create/children",
      authenticateToken,
      this.createChild.bind(this)
    );
    this.router.get(
      "/get_notification",
      authenticateToken,
      this.getParentNotifications.bind(this)
    );
    this.router.delete(
      "/delete/parent-by-email",
      this.deleteUserByEmail.bind(this)
    );
    this.router.get(
      "/get_all/child",
      authenticateToken,
      this.getAllChildren.bind(this)
    );    
    this.router.delete(
      "/delete/child_account",
      authenticateToken,
      this.deleteChldAccount.bind(this)
    );  
  }

  // Override BaseController's listArgVerify to add user-specific query logic
  listArgVerify(req, res, queryOptions) {
    // Remove sensitive fields from the response
    if (queryOptions.attributes) {
      queryOptions.attributes = queryOptions.attributes.filter(
        (attr) => !["password"].includes(attr)
      );
    }
  }

  // Override BaseController's afterCreate for post-creation actions
  async afterCreate(req, res, newObject, transaction) {
    // Remove password from response
    if (newObject.dataValues) {
      delete newObject.dataValues.password;
      //   delete newObject.dataValues.otp;
      //   delete newObject.dataValues.otpExpiry;
    }
  }

  // Custom route handlers
  signup = asyncHandler(async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
      const { name, countryCode, phone, email, password } = req.body;

      // Validation
      if ([name, email, password].some((field) => field?.trim() === "")) {
        return next(
          new ErrorHandler("All required fields must be filled", 400)
        );
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
      // Validate phone if both country code and phone are provided
      let cleanedPhone = null;
      let cleanedCountryCode = null;

      if (phone || countryCode) {
        // If one is provided, both must be provided
        if (!phone || !countryCode) {
          return next(
            new ErrorHandler(
              "Both country code and phone number are required",
              400
            )
          );
        }

        const phoneValidationResult = phoneValidation.validatePhone(
          countryCode,
          phone
        );

        if (!phoneValidationResult.isValid) {
          return next(new ErrorHandler(phoneValidationResult.message, 400));
        }

        cleanedPhone = phoneValidationResult.cleanedPhone;
        cleanedCountryCode = phoneValidationResult.cleanedCode;
      }
      // Validate email format
      if (!isValidEmail(lowercaseEmail)) {
        return next(new ErrorHandler("Invalid email", 400));
      }
      // Modify the query to handle optional phone
      let whereClause = {
        [Op.or]: [{ email: lowercaseEmail }],
      };

      // Only add phone to the query if it's provided
      if (cleanedPhone) {
        whereClause[Op.or].push({ phone: cleanedPhone });
      }
      // Check if user exists
      const existingParents = await models.Parent.findOne({
        where: whereClause,
      });

      if (existingParents) {
        if (existingParents.isEmailVerified) {
          // If the user is already verified, block the attempt to create a new account
          if (cleanedPhone && existingParents.phone === cleanedPhone) {
            return next(new ErrorHandler("Phone number already in use", 409));
          } else if (existingParents.email.toLowerCase() === lowercaseEmail) {
            return next(new ErrorHandler("Email already in use", 409));
          }
        } else {
          // For unverified users
          if (cleanedPhone && existingParents.phone === cleanedPhone) {
            return next(new ErrorHandler("Phone number already in use", 409));
          } else if (existingParents.email.toLowerCase() === lowercaseEmail) {
            return next(new ErrorHandler("Email already in use", 409));
          }
        }
      }

      // Validate the password and create a new user
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
          ...(cleanedPhone && {
            phone: cleanedPhone,
            countryCode: cleanedCountryCode,
          }), // Only include phone if it's provided
          password: hashedPassword,
          name,
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

  login = asyncHandler(async (req, res, next) => {
    try {
      const { email, password } = req.body;

      // Validation
      if ([email, password].some((field) => field?.trim() === "")) {
        return next(
          new ErrorHandler("All required fields must be filled", 400)
        );
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
        type:"parent",
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

  //-----------send OTP-------------------------------
  sendOtp = asyncHandler(async (req, res, next) => {
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

  verifyOTP = asyncHandler(async (req, res, next) => {
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
        type:"parent",
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

  // ---------------FORGET PASSWORD-----------------------------------------------------
  forgotPassword = asyncHandler(async (req, res, next) => {
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
  resetPassword = asyncHandler(async (req, res, next) => {
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

  //-------update parent profile-------------------------------------------------------------
  updateProfile = asyncHandler(async (req, res, next) => {
    const transaction = await models.sequelize.transaction();
    try {
      const { name, country, currency } = req.body;
      const parent = req.parent;
      // Sanitize name: trim and reduce multiple spaces to a single space
      const sanitizedName = name.trim().replace(/\s+/g, " ");
      // Validate name
      const nameError = isValidLength(sanitizedName);
      if (nameError) {
        return next(new ErrorHandler(nameError, 400));
      }
      // Update allowed fields
      if (name) parent.name = sanitizedName;
      if (country) parent.country = country;
      if (currency) parent.currency = currency;

      await parent.save({ transaction });

      await transaction.commit();

      const parentData = parent.toJSON();
      delete parentData.password;
      delete parentData.otp;
      delete parentData.otpExpiry;

      res.json({
        message: "Profile updated successfully",
        user: parentData,
      });
    } catch (error) {
      await transaction.rollback();
      return next(new ErrorHandler(error.message, 500));
    }
  });

  //--------------------create child profile--------------------------------------------------
  createChild = asyncHandler(async (req, res, next) => {
    try {
      const parentId = req.parent.id;
      const {
        name,
        age,
        username,
        password,
        hasBlogAccess,
        deviceSharingMode,
      } = req.body;
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
      const existingChild = await models.Child.findOne({ where: { username:sanatizedUsername } });
      if (existingChild) {
        return next(new ErrorHandler("Username already taken", 400));
      }

      // Create child account
      const newChild = await models.Child.create({
        name:sanitizedName,
        age,
        username:sanatizedUsername,
        password: hashedPassword || null,
        parentId,
        hasBlogAccess: hasBlogAccess || false,
        deviceSharingMode: deviceSharingMode || true,
      });

      // Create initial streak record
      await models.Streak.create({
        childId: newChild.id,
        currentStreak: 0,
      });

      return res.status(201).json({
        success:true,
        message: "Child account created successfully",
        data: {
          id: newChild.id,
          name: newChild.name,
          age: newChild.age,
          username: newChild.username,
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
  getAllChildren = asyncHandler(async (req, res, next) => {
    try {
      const parentId = req.parent.id; 
  
      const parent = await models.Parent.findByPk(parentId, {
        include: [
          {
            model: models.Child,
            as: 'children',
            attributes: ['id', 'name', 'username', 'age', 'coinBalance'],
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

  getParentNotifications = asyncHandler(async (req, res, next) => {
    try {
      const parentId = req.parent.id;

      // Find notifications for the parent
      const notifications = await models.Notification.findAll({
        where: { recipientId: parentId, recipientType: "parent" },
        order: [["createdAt", "DESC"]],
      });

      // Update the isRead status to true for all fetched notifications
      await models.Notification.update(
        { isRead: true },
        { where: { recipientId: parentId } }
      );

      return res.status(200).json({
        success: true,
        message: "Notifications retrieved successfully",
        data: notifications,
      });
    } catch (error) {
      console.error("Error retrieving notifications:", error);
      return next(
        new ErrorHandler(
          error.message || "Failed to retrieve notifications",
          500
        )
      );
    }
  });
  
  deleteUserByEmail = asyncHandler(async (req, res, next) => {
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
  deleteChldAccount = asyncHandler(async (req, res, next) => {
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
  //   deleteProfile = asyncHandler(async (req, res) => {
  //     const transaction = await models.sequelize.transaction();
  //     try {
  //       await req.parent.destroy({ transaction });
  //       await transaction.commit();
  //      return res.status(200).json({status :true, message: "Parent deleted successfully" });
  //     } catch (error) {
  //       await transaction.rollback();
  //       return next(new ErrorHandler( error.message,500 ));
  //     }
  //   });

  //   generateQR = asyncHandler(async (req, res, next) => {
  //     try {
  //       // Generate unique token and channel
  //       const token = crypto.randomBytes(64).toString("hex");
  //       const timestamp = new Date().toISOString();
  //       const channelData = `${timestamp}||${token}`;
  //       const channelHash = crypto
  //         .createHash("md5")
  //         .update(channelData)
  //         .digest("hex");
  //       const os = req.userOS;

  //       // Store QR session
  //       // await createQRSession(channelHash, token, os);
  //       try {
  //         await models.QRSession.create({
  //           channel: channelHash,
  //           token: token,
  //           os: os,
  //           createdAt: new Date(),
  //         });
  //       } catch (error) {
  //         console.error(`Failed to create QR session: ${error.message}`, {
  //           channel,
  //           token,
  //           os,
  //           errorStack: error.stack,
  //         });
  //         return next(new ErrorHandler(error.message, 500));
  //       }

  //       return res.status(200).json({
  //         success: true,
  //         message: "QR code data generated successfully",
  //         data: {
  //           channel: channelHash,
  //           token: token,
  //           expiresIn: QR_EXPIRY_TIME,
  //         },
  //       });
  //     } catch (error) {
  //       console.error("QR Generation Error:", error);
  //       return next(new ErrorHandler(error.message, 500));
  //     }
  //   });

  //   verifyQRLogin = asyncHandler(async (req, res, next) => {
  //     const { channel, token } = req.body;
  //     const accessToken = req.token;
  //     const userId = req.user?.id;

  //     if (!channel || !token) {
  //       return next(new ErrorHandler("Missing required parameters", 400));
  //     }
  //     if (!userId || !accessToken) {
  //       return next(new ErrorHandler("Unauthorized", 403));
  //     }

  //     try {
  //       const io = req.app.get("io");
  //       if (!io) {
  //         throw new Error("Socket.IO instance not found");
  //       }

  //       const sessionData = await getQRSession(channel, userId);

  //       if (!sessionData) {
  //         return next(new ErrorHandler("QR session expired or not found", 404));
  //       }

  //       if (sessionData.token !== token) {
  //         return next(new ErrorHandler("Invalid token", 401));
  //       }

  //       // Wrap socket emission in a Promise to ensure it completes
  //       const emitLoginEvent = () => {
  //         return new Promise((resolve, reject) => {
  //           try {
  //             io.to(channel).emit("login-event", {
  //               token,
  //               accessToken,
  //               userId,
  //             });
  //             console.log("i am emiting login-event");

  //             // Add a small delay to ensure emission completes
  //             setTimeout(resolve, 100);
  //           } catch (error) {
  //             reject(error);
  //           }
  //         });
  //       };

  //       // Execute socket emission and session deletion sequentially
  //       await emitLoginEvent();
  //       // await deleteQRSession(channel);
  //       // Get user's current role and update if needed
  //       const user = await models.User.findByPk(userId);
  //       if (user && user.role === "USER") {
  //         user.role = "CREATOR";
  //         await user.save();
  //         console.log(`Updated user ${userId} role to CREATOR`);
  //       }
  //       // Log successful emission and deletion
  //       console.log(`Login event emitted for channel: ${channel}`);
  //       const sessionInfo = {
  //         channel: sessionData.channel,
  //         UserId: sessionData.userId,
  //         os: sessionData.os,
  //         isActiveSession: sessionData.isActiveSession,
  //       };

  //       return res.status(200).json({
  //         success: true,
  //         message: "Login verification successful",
  //         data: { sessionInfo },
  //       });
  //     } catch (error) {
  //       console.error("QR Verification Error:", error);

  //       // If there's an error, attempt to clean up the session
  //       try {
  //         // Call deleteQRSession and handle its response
  //         const deleteResponse = await deleteQRSession(channel, userId);

  //         // If deleteQRSession fails, respond with the appropriate message and status
  //         if (!deleteResponse.success) {
  //           return res.status(deleteResponse.status).json({
  //             success: deleteResponse.success,
  //             message: deleteResponse.message,
  //           });
  //         }
  //       } catch (cleanupError) {
  //         console.error("Failed to clean up QR session:", cleanupError);
  //       }

  //       return next(new ErrorHandler(error.message, 500));
  //     }
  //   });

  //   getQrSession = asyncHandler(async (req, res, next) => {
  //     const { page, size } = req.query;
  //     const limit = +size || 10; // Default limit is 10
  //     const offset = (+page || 0) * limit; // Default page is 0

  //     if (!req.user?.id) {
  //       return next(new ErrorHandler("Unauthorized", 403));
  //     }

  //     // Modify condition to filter campaigns by authenticated user
  //     const condition = {
  //       UserId: req.user?.id,
  //     };

  //     try {
  //       const data = await models.QRSession.findAndCountAll({
  //         where: condition,
  //         limit,
  //         offset,
  //       });

  //       return res.status(200).json({
  //         success: true,
  //         totalItems: data.count,
  //         sessions: data.rows,
  //         currentPage: page ? +page : 0,
  //         totalPages: Math.ceil(data.count / limit),
  //       });
  //     } catch (error) {
  //       console.error("Error fetching campaigns:", error);
  //       return next(new ErrorHandler(error.message, 500));
  //     }
  //   });

  //   logout = asyncHandler(async (req, res, next) => {
  //     try {
  //       const channel = req.headers["session"]?.trim();
  //       const userId = req.user?.id;

  //       // Validate user context
  //       if (!userId) {
  //         return next(new ErrorHandler("unauthenticated", 401));
  //       }
  //       // Check if channel exists in request
  //       if (!channel) {
  //         return next(new ErrorHandler("Missing session in headers", 400));
  //       }
  //       // Verify session only for web users, including OS information
  //       const session = await models.QRSession.findOne({
  //         where: {
  //           channel: channel,
  //         },
  //       });
  //       console.log(channel);

  //       if (!session) {
  //         return next(new ErrorHandler("Session not found", 404));
  //       }

  //       // Call deleteQRSession and handle its response
  //       const deleteResponse = await deleteQRSession(channel, userId);

  //       // If deleteQRSession fails, respond with the appropriate message and status
  //       if (!deleteResponse.success) {
  //         return res.status(deleteResponse.status).json({
  //           success: deleteResponse.success,
  //           message: deleteResponse.message,
  //         });
  //       }

  //       // Respond with success message if session is deleted successfully
  //       return res.status(200).json({
  //         success: true,
  //         message: "User Logout successful",
  //       });
  //     } catch (error) {
  //       console.error("Logout Error:", error);
  //       return next(
  //         new ErrorHandler(error.message || "An error occurred during logout", 500)
  //       );
  //     }
  //   });

  //   logoutAll = asyncHandler(async (req, res, next) => {
  //     try {
  //       const userId = req.user?.id;

  //       // Validate user context
  //       if (!userId) {
  //         return next(new ErrorHandler("unauthenticated", 401));
  //       }
  //       // Verify session only for web users, including OS information
  //       const sessions = await models.QRSession.findAll({
  //         where: {
  //           UserId: userId,
  //         },
  //       });
  //       console.log(sessions);

  //       if (sessions.length === 0) {
  //         return next(new ErrorHandler("No active sessions found", 404));
  //       }

  //       // Delete all sessions with transaction
  //       await db.sequelize.transaction(async (t) => {
  //         await Promise.all(
  //           sessions.map(async (session) => {
  //             if (session.isActiveSession) {
  //               await session.destroy({ transaction: t });
  //             }
  //           })
  //         );
  //       });

  //       // Respond with success message if sessions are deleted successfully
  //       return res.status(200).json({
  //         success: true,
  //         message: "All user sessions logged out successfully",
  //       });
  //     } catch (error) {
  //       console.error("Logout Error:", error);
  //       return next(
  //         new ErrorHandler(error.message || "An error occurred during logout", 500)
  //       );
  //     }
  //   });
}

module.exports = new ParentController();
