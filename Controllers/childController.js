const bcrypt = require("bcrypt");
const models = require("../Modals/index");
const { Op, literal } = require("sequelize");
const { generateToken } = require("../Utils/parentHelper");
const ErrorHandler = require("../Utils/errorHandle");
const moment = require("moment");
const asyncHandler = require("../Utils/asyncHandler");
const {getChildCoinStats}=require('../Utils/transactionHelper')

// --------child login----------------------------------------
const childLogin = asyncHandler(async (req, res, next) => {
  try {
    let { username, password } = req.body;
    // Validate required fields
    if (!username || username.trim() === "") {
      return next(new ErrorHandler("Username is required", 400));
    }
    username = username.trim();
    // Find child by username
    const child = await models.Child.findOne({
      where: { username },
      include: [
        {
          model: models.Parent,
          as: "parent",
          attributes: ["id", "name", "email"],
        },
      ],
    });

    if (!child) {
      return next(new ErrorHandler("Invalid username or password", 401));
    }

    // If device sharing mode is enabled, password may be null
    if (child.deviceSharingMode) {
      // Special handling for device sharing mode - simplified login
      // In a real app, you might want additional verification
      let obj = {
        type: "child",
        id: child.id,
        name: child.name,
        username: child.username,
      };

      // Generate token
      const token = generateToken(obj);

      return res.status(200).json({
        success: true,
        message: "Login successful",
        token,
        data: {
          id: child.id,
          name: child.name,
          age: child.age,
          coinBalance: child.coinBalance,
          deviceSharingMode: child.deviceSharingMode,
        },
      });
    }

    // For non-device sharing mode, password is required
    if (!password || password.trim() === "") {
      return next(new ErrorHandler("Password is required", 400));
    }

    // Check if child has a password set
    if (!child.password) {
      return next(
        new ErrorHandler(
          "Child account is not properly configured. Please contact your parent.",
          400
        )
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, child.password);
    if (!isPasswordValid) {
      return next(new ErrorHandler("Invalid username or password", 401));
    }
    let obj = {
      type: "child",
      id: child.id,
      name: child.name,
      username: child.username,
    };

    // Generate token
    const token = generateToken(obj);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      data: {
        id: child.id,
        name: child.name,
        age: child.age,
        coinBalance: child.coinBalance,
        deviceSharingMode: child.deviceSharingMode,
      },
    });
  } catch (error) {
    console.error("Error during child login:", error);
    return next(new ErrorHandler(error.message || "Login failed", 500));
  }
});

// --------get child tasks----------------------------------------
const getChildTasks = asyncHandler(async (req, res, next) => {
  try {
    console.log("Fetching tasks for child:", req.child.id);
    const childId = req.child.id;
    const { status } = req.query;

    // Build query based on childId and optional status filter
    const query = { childId };
    if (status) {
      query.status = status
        .split(",")
        .filter((s) =>
          ["assigned", "completed", "approved", "rejected"].includes(s)
        );
    }

    // Get tasks with associated TaskTemplate data
    const tasks = await models.Task.findAll({
      where: query,
      include: [
        {
          model: models.TaskTemplate,
          attributes: ["title", "description", "image"],
          required: true, // Ensure tasks without a template are excluded
        },
      ],
      order: [
        ["dueDate", "ASC"],
        ["createdAt", "DESC"],
      ],
      attributes: [
        "id",
        "coinReward",
        "difficultyLevel",
        "status",
        "dueDate",
        "dueTime",
        "duration",
        "isRecurring",
        "recurringFrequency",
        "completedAt",
      ],
    });

    // Check if tasks exist
    if (!tasks || tasks.length === 0) {
      return next(new ErrorHandler("No tasks found for this child", 404));
    }

    // Format tasks to combine Task and TaskTemplate data
    const formattedTasks = tasks.map((task) => ({
      id: task.id,
      title: task.TaskTemplate?.title,
      description: task.TaskTemplate?.description,
      image: task.TaskTemplate?.image,
      coinReward: task.coinReward,
      difficultyLevel: task.difficultyLevel,
      status: task.status,
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      duration: task.duration,
      isRecurring: task.isRecurring,
      recurringFrequency: task.recurringFrequency,
      completedAt: task.completedAt,
    }));

    return res.status(200).json({
      success: true,
      message: "Tasks retrieved successfully",
      data: formattedTasks,
    });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return next(
      new ErrorHandler(error.message || "Failed to fetch tasks", 500)
    );
  }
});

// --------get child notifications----------------------------------------
const getChildNotifications = asyncHandler(async (req, res, next) => {
  try {
    const childId = req.child.id;
    
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
      recipientId: childId,
      recipientType: "child"
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
    console.error("Error fetching notifications:", error);
    return next(
      new ErrorHandler(error.message || "Failed to fetch notifications", 500)
    );
  }
});


const myWallet = asyncHandler(async (req, res, next) => {
  try {
    const { childId } = req.params;
    const { 
      startDate, 
      endDate, 
      limit = 30,
      page = 1,
      transactionType // Optional filter: 'earning', 'spending', or 'all'
    } = req.query;

    // Validate required parameters
    if (!childId) {
      return res.status(400).json({
        success: false,
        message: 'Child ID is required'
      });
    }

    // Check if child exists
    const child = await models.Child.findByPk(childId);
    if (!child) {
      return next(
        new ErrorHandler('Child not found',404));
    }

    // Build date range filter
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          [Op.between]: [
            moment(startDate).startOf('day').toDate(),
            moment(endDate).endOf('day').toDate()
          ]
        }
      };
    } else if (startDate) {
      dateFilter = {
        createdAt: {
          [Op.gte]: moment(startDate).startOf('day').toDate()
        }
      };
    } else if (endDate) {
      dateFilter = {
        createdAt: {
          [Op.lte]: moment(endDate).endOf('day').toDate()
        }
      };
    } else {
      // Default to last 30 days if no date range provided
      dateFilter = {
        createdAt: {
          [Op.gte]: moment().subtract(30, 'days').startOf('day').toDate()
        }
      };
    }

    // Build transaction type filter
    let typeFilter = {};
    if (transactionType === 'earning') {
      typeFilter = {
        type: {
          [Op.in]: ['task_reward', 'streak_bonus', 'credit', 'blog_reward', 'quiz_reward']
        }
      };
    } else if (transactionType === 'spending') {
      typeFilter = {
        type: {
          [Op.in]: ['spending', 'investment']
        }
      };
    }

    // Fetch transactions with filters
    const transactions = await models.Transaction.findAll({
      where: {
        childId,
        ...dateFilter,
        ...typeFilter
      },
      include: [
        {
          model: models.Task,
          required: false,
          include: [
            {
              model: models.TaskTemplate,
              required: false,
              attributes: ['title', 'image']
            }
          ]
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    // Group transactions by date
    const dayWiseData = {};
    
    transactions.forEach(transaction => {
      const date = moment(transaction.createdAt).format('YYYY-MM-DD');
      
      if (!dayWiseData[date]) {
        dayWiseData[date] = {
          date,
          totalEarned: 0,
          totalSpent: 0,
          netChange: 0,
          transactions: [],
          coinBalanceAtEndOfDay: transaction.coinBalance // Will be updated to show end of day balance
        };
      }

      // Calculate earned vs spent amounts
      const earningTypes = ['task_reward', 'streak_bonus', 'credit', 'blog_reward', 'quiz_reward'];
      const spendingTypes = ['spending', 'investment'];
      
      let amount = 0;
      if (earningTypes.includes(transaction.type)) {
        // For earning types, find the amount by comparing with previous transaction
        // or use a direct amount field if you add it to your model
        const previousBalance = dayWiseData[date].transactions.length > 0 
          ? dayWiseData[date].transactions[dayWiseData[date].transactions.length - 1].coinBalance 
          : (transaction.coinBalance - (transaction.totalEarned - (dayWiseData[date].totalEarned || 0)));
        
        amount = transaction.coinBalance - previousBalance;
        dayWiseData[date].totalEarned += Math.abs(amount);
      } else if (spendingTypes.includes(transaction.type)) {
        // For spending, calculate the difference
        const previousBalance = dayWiseData[date].transactions.length > 0 
          ? dayWiseData[date].transactions[dayWiseData[date].transactions.length - 1].coinBalance 
          : transaction.coinBalance;
        
        amount = Math.abs(previousBalance - transaction.coinBalance);
        dayWiseData[date].totalSpent += amount;
      }

      dayWiseData[date].transactions.push({
        id: transaction.id,
        type: transaction.type,
        description: transaction.description,
        amount: amount,
        coinBalance: transaction.coinBalance,
        totalEarned: transaction.totalEarned,
        time: moment(transaction.createdAt).format('HH:mm'),
        createdAt: transaction.createdAt,
        task: transaction.Task ? {
          id: transaction.Task.id,
          title: transaction.Task.TaskTemplate?.title || 'Unknown Task',
          image: transaction.Task.TaskTemplate?.image,
          status: transaction.Task.status,
          rewardCoins: transaction.Task.rewardCoins
        } : null
      });

      dayWiseData[date].netChange = dayWiseData[date].totalEarned - dayWiseData[date].totalSpent;
      dayWiseData[date].coinBalanceAtEndOfDay = transaction.coinBalance;
    });

    // Convert to array and sort by date descending
    const dayWiseArray = Object.values(dayWiseData).sort((a, b) => 
      moment(b.date).valueOf() - moment(a.date).valueOf()
    );

    // Get current coin stats
    const currentStats = await getChildCoinStats(childId);

    // Calculate pagination info
    const totalTransactions = await models.Transaction.count({
      where: {
        childId,
        ...dateFilter,
        ...typeFilter
      }
    });

    const totalPages = Math.ceil(totalTransactions / parseInt(limit));

    return res.status(200).json({
      success: true,
      data: {
        childId,
        currentCoinBalance: currentStats.coinBalance,
        currentTotalEarned: currentStats.totalEarned,
        dayWiseTransactions: dayWiseArray,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalTransactions,
          hasNextPage: parseInt(page) < totalPages,
          hasPreviousPage: parseInt(page) > 1
        },
        filters: {
          startDate: startDate || null,
          endDate: endDate || null,
          transactionType: transactionType || 'all',
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching day-wise transactions:', error);
    return next(
      new ErrorHandler('Internal server error',500));
  }
});

/**
 * Get transaction summary for a specific date
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getDateTransactionSummary = asyncHandler(async (req, res,next) => {
  try {
    const { childId, date } = req.params;

    if (!childId || !date) {
      return next(
      new ErrorHandler('Child ID and date are required',400));
    }

    // Validate date format
    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
     return next(
      new ErrorHandler('Invalid date format. Use YYYY-MM-DD',400));
    }

    const startOfDay = moment(date).startOf('day').toDate();
    const endOfDay = moment(date).endOf('day').toDate();

    const transactions = await models.Transaction.findAll({
      where: {
        childId,
        createdAt: {
          [Op.between]: [startOfDay, endOfDay]
        }
      },
      include: [
        {
          model: models.Task,
          required: false,
          include: [
            {
              model: models.TaskTemplate,
              required: false,
              attributes: ['title', 'image']
            }
          ]
        }
      ],
      order: [['createdAt', 'ASC']]
    });

    let totalEarned = 0;
    let totalSpent = 0;
    const earningTypes = ['task_reward', 'streak_bonus', 'credit', 'blog_reward', 'quiz_reward'];
    const spendingTypes = ['spending', 'investment'];

    const processedTransactions = transactions.map((transaction, index) => {
      let amount = 0;
      
      if (earningTypes.includes(transaction.type)) {
        const prevTransaction = index > 0 ? transactions[index - 1] : null;
        const prevBalance = prevTransaction ? prevTransaction.coinBalance : (transaction.coinBalance - transaction.totalEarned);
        amount = transaction.coinBalance - prevBalance;
        totalEarned += Math.abs(amount);
      } else if (spendingTypes.includes(transaction.type)) {
        const prevTransaction = index > 0 ? transactions[index - 1] : null;
        const prevBalance = prevTransaction ? prevTransaction.coinBalance : transaction.coinBalance;
        amount = Math.abs(prevBalance - transaction.coinBalance);
        totalSpent += amount;
      }

      return {
        id: transaction.id,
        type: transaction.type,
        description: transaction.description,
        amount: amount,
        coinBalance: transaction.coinBalance,
        totalEarned: transaction.totalEarned,
        time: moment(transaction.createdAt).format('HH:mm:ss'),
        createdAt: transaction.createdAt,
        task: transaction.Task ? {
          id: transaction.Task.id,
          title: transaction.Task.TaskTemplate?.title || 'Unknown Task',
          image: transaction.Task.TaskTemplate?.image,
          status: transaction.Task.status,
          rewardCoins: transaction.Task.rewardCoins
        } : null
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        date,
        totalEarned,
        totalSpent,
        netChange: totalEarned - totalSpent,
        transactionCount: transactions.length,
        transactions: processedTransactions,
        coinBalanceAtStartOfDay: transactions.length > 0 
          ? (transactions[0].coinBalance - totalEarned + totalSpent)
          : 0,
        coinBalanceAtEndOfDay: transactions.length > 0 
          ? transactions[transactions.length - 1].coinBalance 
          : 0
      }
    });

  } catch (error) {
    console.error('Error fetching date transaction summary:', error);
 return next(
      new ErrorHandler('Internal server error',500));
  }
});

module.exports = {
  childLogin,
  getChildTasks,
  getChildNotifications,
  myWallet,
  getDateTransactionSummary
};

// // -----------EXTRA FUNCTIONS FOR NOTIFICATIONS-----------------------------------
// // Additional function to mark notifications as read
// const markNotificationsAsRead = asyncHandler(async (req, res, next) => {
//   try {
//     const { notificationIds } = req.body; // Array of notification IDs to mark as read
//     const userType = req.parent?.id ? "parent" : req.child?.id ? "child" : null;
//     const userId = req.parent?.id || req.child?.id;

//     if (!userType || !userId) {
//       return next(new ErrorHandler("Invalid authentication token", 401));
//     }

//     let whereClause = {
//       recipientId: userId,
//       recipientType: userType,
//       isRead: false
//     };

//     // If specific notification IDs are provided, update only those
//     if (notificationIds && Array.isArray(notificationIds) && notificationIds.length > 0) {
//       whereClause.id = {
//         [models.Sequelize.Op.in]: notificationIds
//       };
//     }

//     const [updatedCount] = await models.Notification.update(
//       { isRead: true },
//       { where: whereClause }
//     );

//     return res.status(200).json({
//       success: true,
//       message: `${updatedCount} notification(s) marked as read`,
//       data: {
//         updatedCount
//       }
//     });
//   } catch (error) {
//     console.error("Error marking notifications as read:", error);
//     return next(
//       new ErrorHandler(error.message || "Failed to mark notifications as read", 500)
//     );
//   }
// });

// // Function to get notification counts/statistics
// const getNotificationStats = asyncHandler(async (req, res, next) => {
//   try {
//     const userType = req.parent?.id ? "parent" : req.child?.id ? "child" : null;
//     const userId = req.parent?.id || req.child?.id;

//     if (!userType || !userId) {
//       return next(new ErrorHandler("Invalid authentication token", 401));
//     }

//     const baseWhere = {
//       recipientId: userId,
//       recipientType: userType
//     };

//     // Get total counts
//     const totalCount = await models.Notification.count({
//       where: baseWhere
//     });

//     const unreadCount = await models.Notification.count({
//       where: { ...baseWhere, isRead: false }
//     });

//     const readCount = await models.Notification.count({
//       where: { ...baseWhere, isRead: true }
//     });

//     // Get counts by type
//     const typeStats = await models.Notification.findAll({
//       where: baseWhere,
//       attributes: [
//         'type',
//         [models.Sequelize.fn('COUNT', models.Sequelize.col('id')), 'count']
//       ],
//       group: ['type'],
//       raw: true
//     });

//     // Get counts by related item type
//     const relatedItemStats = await models.Notification.findAll({
//       where: {
//         ...baseWhere,
//         relatedItemType: { [models.Sequelize.Op.ne]: null }
//       },
//       attributes: [
//         'relatedItemType',
//         [models.Sequelize.fn('COUNT', models.Sequelize.col('id')), 'count']
//       ],
//       group: ['relatedItemType'],
//       raw: true
//     });

//     return res.status(200).json({
//       success: true,
//       message: "Notification statistics retrieved successfully",
//       data: {
//         totals: {
//           total: totalCount,
//           unread: unreadCount,
//           read: readCount
//         },
//         byType: typeStats,
//         byRelatedItemType: relatedItemStats
//       }
//     });
//   } catch (error) {
//     console.error("Error fetching notification stats:", error);
//     return next(
//       new ErrorHandler(error.message || "Failed to fetch notification statistics", 500)
//     );
//   }
// });
