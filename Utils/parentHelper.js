const jwt = require("jsonwebtoken");
require("dotenv").config();
const { Op } = require('sequelize');
const models = require('../Modals/index');
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

    // Create payload with tokenVersion included
    const payload = {
      obj: {
        ...user,
        tokenVersion: user.tokenVersion || 0
      }
    };

    return jwt.sign(payload, process.env.JWT_SECRET, {
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

// Helper function to get date range based on filter
const getDateRange = (filter) => {
  const now = new Date();
  let startDate, endDate;

  switch (filter) {
    case 'day':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      break;
    case 'week':
      const dayOfWeek = now.getDay();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 7);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      break;
    default:
      return null;
  }

  return { startDate, endDate };
};

// Helper function to get time series data for graphs
const getTimeSeriesData = async (parentId, modelType, statusField, filter) => {
  const now = new Date();
  let periods = [];
  
  if (filter === 'day') {
    // Last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      periods.push({
        label: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        startDate: date,
        endDate: nextDate
      });
    }
  } else if (filter === 'week') {
    // Last 4 weeks
    for (let i = 3; i >= 0; i--) {
      const startOfWeek = new Date();
      const dayOfWeek = startOfWeek.getDay();
      startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek - (i * 7));
      startOfWeek.setHours(0, 0, 0, 0);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 7);
      
      periods.push({
        label: `Week ${4 - i}`,
        startDate: startOfWeek,
        endDate: endOfWeek
      });
    }
  } else if (filter === 'month') {
    // Last 6 months
    for (let i = 5; i >= 0; i--) {
      const startOfMonth = new Date();
      startOfMonth.setMonth(startOfMonth.getMonth() - i, 1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const endOfMonth = new Date(startOfMonth);
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);
      
      periods.push({
        label: startOfMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        startDate: startOfMonth,
        endDate: endOfMonth
      });
    }
  }

  const result = [];
  
  for (const period of periods) {
    // Since Goals now have parentId directly, both can use same logic
    const approved = await models[modelType].count({
      where: {
        parentId: parentId,
        [statusField]: 'APPROVED',
        approvedAt: {
          [Op.gte]: period.startDate,
          [Op.lt]: period.endDate
        }
      }
    });

    const rejected = await models[modelType].count({
      where: {
        parentId: parentId,
        [statusField]: 'REJECTED',
        rejectedAt: {
          [Op.gte]: period.startDate,
          [Op.lt]: period.endDate
        }
      }
    });

    result.push({
      period: period.label,
      approved,
      rejected
    });
  }

  return result;
};

module.exports = { generateOTP, generateToken,calculateNextDueDate,createNextRecurringTask ,verifyGoogleLogin,getDateRange,getTimeSeriesData};