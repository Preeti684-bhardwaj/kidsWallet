const { Op } = require('sequelize');
const moment = require('moment');
const { v4: uuidv4, validate: isValidUUID } = require('uuid');
const asyncHandler = require('../Utils/asyncHandler');
const ErrorHandler = require('../Utils/errorHandle');
const models = require('../Modals/index');

// Calculate default reward coins based on difficulty and title
const calculateDefaultReward = (title, difficulty = 'EASY') => {
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
  const baseReward = baseRewards[title] || 10; // Default to 10 coins
  return Math.round(baseReward * (difficultyMultiplier[difficulty] || 1));
};

// Validate time format (HH:MM)
const validateTimeFormat = (time) => {
  if (!time) return true; // Allow null/undefined
  return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
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

  if (query.status && !['ALL', 'UPCOMING', 'PENDING', 'COMPLETED', 'APPROVED', 'REJECTED', 'OVERDUE'].includes(query.status)) {
    errors.push('Invalid status. Must be UPCOMING, PENDING, COMPLETED, APPROVED, REJECTED, or OVERDUE');
  }

  if (query.recurrence && !['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY'].includes(query.recurrence)) {
    errors.push('Invalid recurrence. Must be ONCE, DAILY, WEEKLY, or MONTHLY');
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

  if (query.parentId && !isValidUUID(query.parentId)) {
    errors.push('Invalid parentId. Must be a valid UUID');
  }

  if (query.taskTemplateId && !isValidUUID(query.taskTemplateId)) {
    errors.push('Invalid taskTemplateId. Must be a valid UUID');
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

// Check if a task is overdue
const isTaskOverdue = (task) => {
  const now = moment().tz('Asia/Kolkata');
  const taskDueDate = moment(task.dueDate).tz('Asia/Kolkata');
  
  if (task.status !== 'PENDING') return false;
  
  // If task is due on a different day
  if (!taskDueDate.isSame(now, 'day')) {
    return taskDueDate.isBefore(now, 'day');
  }
  
  // If task is due today, check time
  if (task.dueTime) {
    const currentTime = now.format('HH:mm');
    return task.dueTime < currentTime;
  }
  
  return false;
};

// Update overdue tasks
const updateOverdueTasks = async () => {
  try {
    const tasks = await models.Task.findAll({
      where: {
        status: 'PENDING'
      }
    });

    const overdueTasks = tasks.filter(task => isTaskOverdue(task));
    
    for (const task of overdueTasks) {
      await task.update({ status: 'OVERDUE' });
    }
    
    return overdueTasks.length;
  } catch (error) {
    console.error('Error updating overdue tasks:', error);
    throw error;
  }
};

// Generate next due date for recurring tasks
const getNextDueDate = (currentDueDate, recurrence) => {
  const nextDate = moment(currentDueDate).tz('Asia/Kolkata');
  
  switch (recurrence) {
    case 'DAILY':
      return nextDate.add(1, 'day').toDate();
    case 'WEEKLY':
      return nextDate.add(1, 'week').toDate();
    case 'MONTHLY':
      return nextDate.add(1, 'month').toDate();
    default:
      return null;
  }
};

// Build task query filters
const buildTaskFilters = (filters = {}) => {
  const where = {};
  const include = [];

  if (filters.status && filters.status !== 'ALL') {
    where.status = filters.status;
  }

  if (filters.childId) {
    where.childId = filters.childId;
  }

  if (filters.parentId) {
    where.parentId = filters.parentId;
  }

  if (filters.taskTemplateId) {
    where.taskTemplateId = filters.taskTemplateId;
  }

  if (filters.recurrence) {
    where.recurrence = filters.recurrence;
  }

  if (filters.isRecurring !== undefined) {
    where.isRecurring = filters.isRecurring;
  }

  if (filters.dueDateFrom || filters.dueDateTo) {
    where.dueDate = {};
    if (filters.dueDateFrom) {
      where.dueDate[Op.gte] = new Date(filters.dueDateFrom);
    }
    if (filters.dueDateTo) {
      where.dueDate[Op.lte] = new Date(filters.dueDateTo);
    }
  }

  // Always include TaskTemplate
  include.push({ model: models.TaskTemplate });

  return { where, include };
};

module.exports = {
  calculateDefaultReward,
  validateTimeFormat,
  sortRecurrenceDates,
  validateQueryParams,
  isTaskOverdue,
  updateOverdueTasks,
  getNextDueDate,
  buildTaskFilters
};