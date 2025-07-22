const jwt = require("jsonwebtoken");
require("dotenv").config();
const { CLIENT_ID, ANDROID_ENDUSER_CLIENT_ID, WEB_ENDUSER_CLIENT_ID } =
  process.env;
const { OAuth2Client } = require("google-auth-library");
const googleClient = new OAuth2Client({
  clientId: CLIENT_ID || ANDROID_ENDUSER_CLIENT_ID || WEB_ENDUSER_CLIENT_ID,
});

const generateToken = (user) => {
  try {
    if (!user || !process.env.JWT_SECRET) {
      return {
        success: false,
        status: 500,
        message: "Invalid token generation parameters",
      };
    }
    return jwt.sign({ obj: user }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
  } catch (error) {
    console.error("Token generation error:", error);
    return {
      success: false,
      status: 500,
      message: error.message || "Failed to generate authentication token",
    };
  }
};

const generateOTP = () => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    if (otp.length !== 6) {
      return {
        success: false,
        status: 500,
        message: "OTP generation failed",
      };
    }
    return otp;
  } catch (error) {
    console.error("OTP generation error:", error);
    return {
      success: false,
      status: 500,
      message: error.message || "Failed to generate OTP",
    };
  }
};

function calculateNextDueDate(currentDate, frequency, dueTime) {
  const nextDate = new Date(currentDate);
  const [hours, minutes] = dueTime ? dueTime.split(':') : [0, 0];

  // Adjust the date based on frequency
  switch (frequency) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'monthly':
      const currentDay = nextDate.getDate();
      nextDate.setMonth(nextDate.getMonth() + 1);
      // Handle month-end edge cases (e.g., Jan 31 -> Feb 28/29)
      if (nextDate.getDate() !== currentDay) {
        nextDate.setDate(0); // Set to last day of the previous month
      }
      break;
    case 'once':
      return null; // No next date for one-time tasks
    default:
      throw new Error(`Unsupported frequency: ${frequency}`);
  }

  // Preserve the time
  nextDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  return nextDate;
}

// Additional helper function for managing recurring tasks
async function createNextRecurringTask(taskId) {
  const task = await models.Task.findByPk(taskId);
  
  if (!task || !task.isRecurring || task.recurringFrequency === 'once') {
    return null;
  }
  
  const nextDueDate = calculateNextDueDate(task.dueDate, task.recurringFrequency);
  
  // Check if we should create the next instance
  const metadata = task.recurringMetadata || {};
  if (metadata.endDate && nextDueDate > new Date(metadata.endDate)) {
    return null; // Don't create task past end date
  }
  
  // Create next task instance
  const nextTask = await models.Task.create({
    ...task.dataValues,
    id: undefined, // Let DB generate new ID
    dueDate: nextDueDate,
    status: 'assigned',
    createdAt: undefined,
    updatedAt: undefined
  });
  
  return nextTask;
}

const verifyGoogleLogin = async (idToken) => {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: idToken,
      audience: [CLIENT_ID, ANDROID_ENDUSER_CLIENT_ID, WEB_ENDUSER_CLIENT_ID],
    });

    const payload = ticket.getPayload();
    console.log("Full token payload:", JSON.stringify(payload, null, 2));
    console.log("Token audience:", payload.aud);

    return payload;
  } catch (error) {
    console.error("Detailed error verifying Google token:", {
      message: error.message,
      stack: error.stack,
    });
    return null;
  }
};

module.exports = { generateOTP, generateToken,calculateNextDueDate,createNextRecurringTask ,verifyGoogleLogin};