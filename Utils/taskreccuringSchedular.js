const cron = require('node-cron');
const models = require('../Modals/index');
const { calculateNextDueDate } = require('../Utils/parentHelper');

// Scheduler to handle recurring tasks
const startTaskScheduler = () => {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      console.log('Running task scheduler at:', new Date().toISOString());

      // Find all approved tasks that are recurring
      const tasks = await models.Task.findAll({
        where: {
          status: 'approved',
          isRecurring: true,
          recurringFrequency: ['daily', 'weekly', 'monthly'], 
        },
        include: [
          {
            model: models.TaskTemplate,
            attributes: ['id', 'title', 'description', 'image']
          }
        ]
      });

      const now = new Date();

      for (const task of tasks) {
        // Combine dueDate and dueTime to get the full dueDateTime
        const dueDateTime = new Date(task.dueDate);
        const [hours, minutes] = task.dueTime ? task.dueTime.split(':') : [0, 0];
        dueDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        // Check if the current time is past the task's due date and time
        if (now >= dueDateTime) {
          // Calculate the next due date
          const nextDueDateTime = calculateNextDueDate(
            task.dueDate,
            task.recurringFrequency,
            task.dueTime
          );

          if (!nextDueDateTime) continue; // Skip if no next date (shouldn't happen due to filter)

          // Check if the next due date is still in the future (to avoid creating tasks for past dates)
          if (nextDueDateTime < now) {
            console.log(`Skipping task ${task.id} as next due date ${nextDueDateTime} is in the past.`);
            continue;
          }

          // Check for duplicate task to avoid creating the same task multiple times
          const existingTask = await models.Task.findOne({
            where: {
              childId: task.childId,
              taskTemplateId: task.taskTemplateId,
              dueDate: nextDueDateTime,
            }
          });

          if (existingTask) {
            console.log(`Task ${task.id} already has a recurring instance for ${nextDueDateTime}.`);
            continue;
          }

          // Create the new task instance
          const newTask = await models.Task.create({
            taskTemplateId: task.taskTemplateId, // Link to the same TaskTemplate
            coinReward: task.coinReward,
            difficultyLevel: task.difficultyLevel,
            childId: task.childId,
            parentId: task.parentId,
            dueDate: nextDueDateTime,
            dueTime: task.dueTime, // Preserve the original time
            duration: task.duration,
            isRecurring: true,
            recurringFrequency: task.recurringFrequency,
            parentTaskId: task.parentTaskId || task.id, // Link to the original task
            status: 'assigned', // New instance starts as assigned
          });

          // Create notification for child
          await models.Notification.create({
            type: 'task_reminder',
            message: `New recurring task assigned: ${task.TaskTemplate.title}`,
            recipientType: 'child',
            recipientId: task.childId,
            relatedItemType: 'task',
            relatedItemId: newTask.id,
          });

          console.log(`Created new recurring task instance ${newTask.id} for task ${task.id}`);
        }
      }
    } catch (error) {
      console.error('Error in task scheduler:', error);
    }
  });

  console.log('Task scheduler started.');
};

module.exports = { startTaskScheduler };