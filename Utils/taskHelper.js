const { Op } = require('sequelize');
const moment = require('moment');
const { v4: uuidv4, validate: isValidUUID } = require('uuid');
const asyncHandler = require('../Utils/asyncHandler');
const ErrorHandler = require('../Utils/errorHandle');
const models = require('../Modals/index'); // Assuming you have an index file that exports all models

// Calculate default reward coins based on difficulty and title
const calculateDefaultReward = (title, difficulty) => {
  const baseRewards = {
    'Making the bed': 5,
    'Washing the dishes': 10,
    'Helping in the garden': 20,
  };
  const difficultyMultiplier = {
    EASY: 1,
    MEDIUM: 1.5,
    HARD: 2,
  };
  const baseReward = baseRewards[title] || 5;
  return Math.round(baseReward * (difficultyMultiplier[difficulty] || 1));
};

// Sort recurrence dates (validation is now handled by the model)
const sortRecurrenceDates = (dates) => {
  if (!dates || !Array.isArray(dates)) return [];
  return dates.sort((a, b) => {
    return moment(a, 'DD-MM-YYYY').diff(moment(b, 'DD-MM-YYYY'));
  });
};

const validateQueryParams = (query) => {
  const errors = [];

  if (query.status && !['ALL','UPCOMING','PENDING', 'COMPLETED', 'APPROVED', 'REJECTED', 'OVERDUE'].includes(query.status)) {
    errors.push('Invalid status. Must be UPCOMING,PENDING, COMPLETED, APPROVED, REJECTED, or OVERDUE');
  }

  if (query.difficulty && !['EASY', 'MEDIUM', 'HARD'].includes(query.difficulty)) {
    errors.push('Invalid difficulty. Must be EASY, MEDIUM, or HARD');
  }

  if (query.dueDateFrom && isNaN(Date.parse(query.dueDateFrom))) {
    errors.push('Invalid dueDateFrom. Must be a valid date');
  }

  if (query.dueDateTo && isNaN(Date.parse(query.dueDateTo))) {
    errors.push('Invalid dueDateTo. Must be a valid date');
  }

  if (query.dueDateFrom && query.dueDateTo && new Date(query.dueDateFrom) > new Date(query.dueDateTo)) {
    errors.push('dueDateFrom cannot be later than dueDateTo');
  }

  if (query.childId && !isValidUUID(query.childId)) {
    errors.push('Invalid childId. Must be a valid UUID');
  }

  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;

  if (page < 1) {
    errors.push('Page must be at least 1');
  }

  if (limit < 1 || limit > 100) {
    errors.push('Limit must be between 1 and 100');
  }

  return { errors, page, limit };
};


//--------------------Additional helper function for getting filter options---------------------------------------------------------
// const getTaskTemplateFilterOptions = asyncHandler(async (req, res, next) => {
//   try {
//     let options = {
//       sortOptions: [
//         { value: 'createdAt', label: 'Created Date' },
//         { value: 'updatedAt', label: 'Updated Date' },
//         { value: 'title', label: 'Title' }
//       ],
//       sortOrders: [
//         { value: 'DESC', label: 'Descending' },
//         { value: 'ASC', label: 'Ascending' }
//       ],
//       createdByOptions: [
//         { value: 'all', label: 'All' },
//         { value: 'parent', label: 'Parents' },
//         { value: 'admin', label: 'Admins' }
//       ]
//     };

//     if (req.userType === "admin") {
//       // For admins, also provide list of parents and admins for filtering
//       const [parents, admins] = await Promise.all([
//         models.Parent.findAll({
//           attributes: ['id', 'email'],
//           order: [['createdAt', 'DESC']]
//         }),
//         models.Admin.findAll({
//           attributes: ['id', 'email'],
//           order: [['createdAt', 'DESC']]
//         })
//       ]);

//       options.parents = parents.map(parent => ({
//         value: parent.id,
//         label: `${parent.firstName || ''} ${parent.lastName || ''}`.trim() || parent.email
//       }));

//       options.admins = admins.map(admin => ({
//         value: admin.id,
//         label: `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.email
//       }));
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Filter options fetched successfully",
//       data: options
//     });
//   } catch (error) {
//     console.error("Error fetching filter options:", error);
//     return next(
//       new ErrorHandler(error.message || "Failed to fetch filter options", 500)
//     );
//   }
// });

// // // Check if a task is overdue based on dueTime
// const isTaskOverdue = (task) => {
//   const now = moment();
//   const dueTime = moment(task.dueTime);
//   return task.status === 'PENDING' && now.isAfter(dueTime);
// };

// // Update task status to overdue
// const updateTaskStatus = async (Task) => {
//   const tasks = await Task.findAll({
//     where: {
//       status: 'PENDING',
//       dueTime: { [Op.lt]: new Date() },
//     },
//   });

//   for (const task of tasks) {
//     await task.update({ status: 'OVERDUE' });
//   }
// };

// // Generate next occurrences for recurring tasks based on recurrenceDates
// const generateNextOccurrences = (task) => {
//   const now = moment();
//   const recurrenceDates = task.recurrenceDates || [];
//   const dueTime = moment(task.dueTime);
//   const currentDate = dueTime.format('DD-MM-YYYY');
//   const timeOfDay = dueTime.format('HH:mm:ss');

//   // Find dates after the current task's due date
//   const futureDates = recurrenceDates.filter(date => {
//     return moment(date, 'DD-MM-YYYY').isAfter(dueTime);
//   });

//   // Map future dates to new dueTime values, preserving the time of day
//   return futureDates.map(date => {
//     const newDueTime = moment(`${date} ${timeOfDay}`, 'DD-MM-YYYY HH:mm:ss').toDate();
//     return { nextDueTime: newDueTime };
//   });
// };

module.exports = {
  calculateDefaultReward,
  sortRecurrenceDates,
  validateQueryParams
};
// getTaskTemplateFilterOptions,
// isTaskOverdue,
// updateTaskStatus,
// generateNextOccurrences,