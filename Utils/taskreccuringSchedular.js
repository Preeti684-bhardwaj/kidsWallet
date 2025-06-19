const cron = require('node-cron');
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const models = require('../Modals/index');
const sequelize = models.db.sequelize;

const scheduleTaskStatusAndRecurrence = () => {
  cron.schedule('0 0 * * *', async () => {
    console.log('Running daily task scheduler at', new Date().toISOString());
    const t = await sequelize.transaction();
    try {
      // Update UPCOMING tasks to PENDING if due date is today
      const today = moment().tz('Asia/Kolkata').startOf('day');
      const upcomingTasks = await models.Task.findAll({
        where: {
          status: 'UPCOMING',
          dueDate: {
            [Op.gte]: today.toDate(),
            [Op.lt]: moment(today).add(1, 'day').toDate()
          }
        },
        include: [{ model: models.TaskTemplate }],
        transaction: t,
      });

      for (const task of upcomingTasks) {
        await task.update({ status: 'PENDING' }, { transaction: t });
        if (task.notificationEnabled) {
          await models.Notification.create(
            {
              type: "task_update",
              message:`Task "${task.TaskTemplate.title}" is now pending for today.`,
              recipientType: "child",
              recipientId: task.childId,
              relatedItemType: "task",
              relatedItemId: task.id
            },
            { transaction: t }
          );
        }
      }

      // Update overdue tasks - using dueDate and dueTime combination
      const overdueTasks = await models.Task.findAll({
        where: {
          status: 'PENDING',
          dueDate: { [Op.lt]: moment().tz('Asia/Kolkata').startOf('day').toDate() },
        },
        include: [{ model: models.TaskTemplate }],
        transaction: t,
      });

      // Also check for tasks due today but past their dueTime
      const todayOverdueTasks = await models.Task.findAll({
        where: {
          status: 'PENDING',
          dueDate: {
            [Op.gte]: today.toDate(),
            [Op.lt]: moment(today).add(1, 'day').toDate()
          },
          dueTime: { [Op.ne]: null }
        },
        include: [{ model: models.TaskTemplate }],
        transaction: t,
      });

      // Filter today's tasks that are past their due time
      const currentTime = moment().tz('Asia/Kolkata').format('HH:mm');
      const todayOverdueFiltered = todayOverdueTasks.filter(task => {
        return task.dueTime && task.dueTime < currentTime;
      });

      const allOverdueTasks = [...overdueTasks, ...todayOverdueFiltered];

      for (const task of allOverdueTasks) {
        await task.update({ status: 'OVERDUE' }, { transaction: t });
        if (task.notificationEnabled) {
          await models.Notification.create(
            {
              type: "task_update",
              message:`Task "${task.TaskTemplate.title}" is overdue.`,
              recipientType: "child",
              recipientId: task.childId,
              relatedItemType: "task",
              relatedItemId: task.id
            },
            { transaction: t }
          );
        }
      }

      // Create new instances for daily recurring tasks only
      const dailyTasks = await models.Task.findAll({
        where: {
          isRecurring: true,
          recurrence: 'DAILY',
          status: { [Op.in]: ['PENDING', 'COMPLETED', 'APPROVED', 'REJECTED'] },
        },
        include: [{ model: models.TaskTemplate }],
        transaction: t,
      });

      for (const task of dailyTasks) {
        const nextDueDate = moment(task.dueDate).tz('Asia/Kolkata').add(1, 'day').toDate();
        
        // Check for existing task to avoid duplicates
        const existingTask = await models.Task.findOne({
          where: {
            childId: task.childId,
            taskTemplateId: task.taskTemplateId,
            dueDate: {
              [Op.gte]: moment(nextDueDate).startOf('day').toDate(),
              [Op.lt]: moment(nextDueDate).add(1, 'day').startOf('day').toDate()
            }
          },
          transaction: t,
        });

        if (!existingTask) {
          await models.Task.create(
            {
              taskTemplateId: task.taskTemplateId,
              parentId: task.parentId,
              childId: task.childId,
              dueDate: nextDueDate,
              dueTime: task.dueTime,
              description: task.description,
              recurrence: task.recurrence,
              rewardCoins: task.rewardCoins,
              isRecurring: true,
              status: moment(nextDueDate).tz('Asia/Kolkata').isSame(today, 'day') ? 'PENDING' : 'UPCOMING',
              notificationEnabled: task.notificationEnabled,
            },
            { transaction: t }
          );

          if (task.notificationEnabled) {
            await models.Notification.create(
              {
                type: "task_reminder",
                message: `New recurring task "${task.TaskTemplate.title}" assigned for ${moment(nextDueDate).format('DD-MM-YYYY')}.`,
                recipientType: "child",
                recipientId: task.childId,
                relatedItemType: "task",
                relatedItemId: task.id
              },
              { transaction: t }
            );
          }
        }
      }

      await t.commit();
      console.log('Task scheduler completed successfully');
    } catch (error) {
      await t.rollback();
      console.error('Error in task scheduler:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  });
};

module.exports = { scheduleTaskStatusAndRecurrence };