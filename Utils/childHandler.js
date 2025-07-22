// const models = require("../Modals/index");
// const { Op } = require("sequelize")
  
//   /**
//    * Get chore completion and rejection percentages
//    */
//   async function getChorePercentages(childId) {
//     try {
//       const totalChores = await models.Task.count({
//         where: { childId }
//       });

//       if (totalChores === 0) {
//         return {
//           completed: 0,
//           rejected: 0,
//           approved: 0,
//           pending: 0,
//           overdue: 0,
//           upcoming: 0,
//           total: 0
//         };
//       }

//       const statusCounts = await models.Task.findAll({
//         where: { childId },
//         attributes: [
//           'status',
//           [models.db.sequelize.fn('COUNT', '*'), 'count']
//         ],
//         group: ['status'],
//         raw: true
//       });

//       const counts = {
//         COMPLETED: 0,
//         REJECTED: 0,
//         APPROVED: 0,
//         PENDING: 0,
//         OVERDUE: 0,
//         UPCOMING: 0
//       };

//       statusCounts.forEach(item => {
//         counts[item.status] = parseInt(item.count);
//       });

//       return {
//         completed: parseFloat(((counts.COMPLETED / totalChores) * 100).toFixed(2)),
//         rejected: parseFloat(((counts.REJECTED / totalChores) * 100).toFixed(2)),
//         approved: parseFloat(((counts.APPROVED / totalChores) * 100).toFixed(2)),
//         pending: parseFloat(((counts.PENDING / totalChores) * 100).toFixed(2)),
//         overdue: parseFloat(((counts.OVERDUE / totalChores) * 100).toFixed(2)),
//         upcoming: parseFloat(((counts.UPCOMING / totalChores) * 100).toFixed(2)),
//         total: totalChores
//       };

//     } catch (error) {
//       console.error('Error in getChorePercentages:', error);
//       throw error;
//     }
//   }

//   /**
//    * Get goal completion and rejection percentages
//    */
//   async function getGoalPercentages(childId) {
//     try {
//       const totalGoals = await models.Goal.count({
//         where: { childId }
//       });

//       if (totalGoals === 0) {
//         return {
//           completed: 0,
//           rejected: 0,
//           approved: 0,
//           pending: 0,
//           total: 0
//         };
//       }

//       const statusCounts = await models.Goal.findAll({
//         where: { childId },
//         attributes: [
//           'status',
//           [models.db.sequelize.fn('COUNT', '*'), 'count']
//         ],
//         group: ['status'],
//         raw: true
//       });

//       const counts = {
//         COMPLETED: 0,
//         REJECTED: 0,
//         APPROVED: 0,
//         PENDING: 0
//       };

//       statusCounts.forEach(item => {
//         counts[item.status] = parseInt(item.count);
//       });

//       return {
//         completed: parseFloat(((counts.COMPLETED / totalGoals) * 100).toFixed(2)),
//         rejected: parseFloat(((counts.REJECTED / totalGoals) * 100).toFixed(2)),
//         approved: parseFloat(((counts.APPROVED / totalGoals) * 100).toFixed(2)),
//         pending: parseFloat(((counts.PENDING / totalGoals) * 100).toFixed(2)),
//         total: totalGoals
//       };

//     } catch (error) {
//       console.error('Error in getGoalPercentages:', error);
//       throw error;
//     }
//   }

//   /**
//    * Get chore status counts
//    */
//   async function getChoreStatusCounts(childId) {
//     try {
//       const statusCounts = await models.Task.findAll({
//         where: { childId },
//         attributes: [
//           'status',
//           [models.db.sequelize.fn('COUNT', '*'), 'count']
//         ],
//         group: ['status'],
//         raw: true
//       });

//       const counts = {
//         completed: 0,
//         rejected: 0,
//         approved: 0,
//         pending: 0,
//         overdue: 0,
//         upcoming: 0,
//         total: 0
//       };

//       statusCounts.forEach(item => {
//         const status = item.status.toLowerCase();
//         counts[status] = parseInt(item.count);
//         counts.total += parseInt(item.count);
//       });

//       return counts;

//     } catch (error) {
//       console.error('Error in getChoreStatusCounts:', error);
//       throw error;
//     }
//   }

//   /**
//    * Get goal status counts
//    */
//   async function getGoalStatusCounts(childId) {
//     try {
//       const statusCounts = await models.Goal.findAll({
//         where: { childId },
//         attributes: [
//           'status',
//           [models.db.sequelize.fn('COUNT', '*'), 'count']
//         ],
//         group: ['status'],
//         raw: true
//       });

//       const counts = {
//         completed: 0,
//         rejected: 0,
//         approved: 0,
//         pending: 0,
//         total: 0
//       };

//       statusCounts.forEach(item => {
//         const status = item.status.toLowerCase();
//         counts[status] = parseInt(item.count);
//         counts.total += parseInt(item.count);
//       });

//       return counts;

//     } catch (error) {
//       console.error('Error in getGoalStatusCounts:', error);
//       throw error;
//     }
//   }

//   /**
//    * Get daily chores with template details
//    */
//   async function getDailyChores(childId, date) {
//     try {
//       const startOfDay = new Date(date);
//       startOfDay.setHours(0, 0, 0, 0);
      
//       const endOfDay = new Date(date);
//       endOfDay.setHours(23, 59, 59, 999);

//       const chores = await models.Task.findAll({
//         where: {
//           childId,
//           [Op.or]: [
//             {
//               dueDate: {
//                 [Op.between]: [startOfDay, endOfDay]
//               }
//             },
//             {
//               createdAt: {
//                 [Op.between]: [startOfDay, endOfDay]
//               }
//             }
//           ]
//         },
//         include: [
//           {
//             model: models.TaskTemplate,
//             attributes: ['id', 'title', 'image']
//           }
//         ],
//         attributes: [
//           'id', 'status', 'rewardCoins', 'dueDate', 'dueTime', 
//           'description', 'completedAt', 'approvedAt', 'rejectedAt',
//           'rejectionReason', 'createdAt'
//         ],
//         order: [['dueTime', 'ASC'], ['createdAt', 'ASC']]
//       });

//       return chores.map(chore => ({
//         id: chore.id,
//         status: chore.status,
//         rewardCoins: chore.rewardCoins,
//         dueDate: chore.dueDate,
//         dueTime: chore.dueTime,
//         description: chore.description,
//         completedAt: chore.completedAt,
//         approvedAt: chore.approvedAt,
//         rejectedAt: chore.rejectedAt,
//         rejectionReason: chore.rejectionReason,
//         template: chore.TaskTemplate ? {
//           id: chore.TaskTemplate.id,
//           title: chore.TaskTemplate.title,
//           image: chore.TaskTemplate.image
//         } : null
//       }));

//     } catch (error) {
//       console.error('Error in getDailyChores:', error);
//       throw error;
//     }
//   }

//   /**
//    * Get period statistics for bar graph
//    */
//   async function getPeriodStats(childId, period) {
//     try {
//       const now = new Date();
//       let startDate, endDate, groupBy, dateFormat;

//       switch (period) {
//         case 'week':
//           startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
//           endDate = now;
//           groupBy = models.db.sequelize.fn('DATE', models.db.sequelize.col('completedAt'));
//           dateFormat = 'YYYY-MM-DD';
//           break;
//         case 'month':
//           startDate = new Date(now.getFullYear(), now.getMonth(), 1);
//           endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
//           groupBy = models.db.sequelize.fn('DATE', models.db.sequelize.col('completedAt'));
//           dateFormat = 'YYYY-MM-DD';
//           break;
//         default: // day
//           startDate = new Date(now.setHours(0, 0, 0, 0));
//           endDate = new Date(now.setHours(23, 59, 59, 999));
//           groupBy = models.db.sequelize.fn('HOUR', models.db.sequelize.col('completedAt'));
//           dateFormat = 'HH';
//       }

//       // Get completed tasks
//       const completedStats = await models.Task.findAll({
//         where: {
//           childId,
//           status: 'COMPLETED',
//           completedAt: {
//             [Op.between]: [startDate, endDate]
//           }
//         },
//         attributes: [
//           [groupBy, 'period'],
//           [models.db.sequelize.fn('COUNT', '*'), 'count']
//         ],
//         group: [groupBy],
//         raw: true
//       });

//       // Get rejected tasks
//       const rejectedStats = await models.Task.findAll({
//         where: {
//           childId,
//           status: 'REJECTED',
//           rejectedAt: {
//             [Op.between]: [startDate, endDate]
//           }
//         },
//         attributes: [
//           [models.db.sequelize.fn('DATE', models.db.sequelize.col('rejectedAt')), 'period'],
//           [models.db.sequelize.fn('COUNT', '*'), 'count']
//         ],
//         group: [models.db.sequelize.fn('DATE', models.db.sequelize.col('rejectedAt'))],
//         raw: true
//       });

//       return {
//         period,
//         startDate: startDate.toISOString(),
//         endDate: endDate.toISOString(),
//         completed: completedStats.map(item => ({
//           period: item.period,
//           count: parseInt(item.count)
//         })),
//         rejected: rejectedStats.map(item => ({
//           period: item.period,
//           count: parseInt(item.count)
//         }))
//       };

//     } catch (error) {
//       console.error('Error in getPeriodStats:', error);
//       throw error;
//     }
//   }

//   /**
//    * Get child streak information
//    */
//   async function getChildStreak(req, res) {
//     try {
//       const { childId } = req.params;

//       if (!childId) {
//         return res.status(400).json({
//           success: false,
//           message: 'Child ID is required'
//         });
//       }

//       const streak = await models.Streak.findOne({
//         where: { childId },
//         include: [
//           {
//             model: models.Child,
//             attributes: ['name', 'coinBalance']
//           }
//         ]
//       });

//       if (!streak) {
//         return res.status(404).json({
//           success: false,
//           message: 'Streak data not found for this child'
//         });
//       }

//       return res.status(200).json({
//         success: true,
//         data: {
//           currentStreak: streak.currentStreak,
//           lastCompletedDate: streak.lastCompletedDate,
//           child: streak.Child
//         }
//       });

//     } catch (error) {
//       console.error('Error in getChildStreak:', error);
//       return res.status(500).json({
//         success: false,
//         message: 'Internal server error',
//         error: process.env.NODE_ENV === 'development' ? error.message : undefined
//       });
//     }
//   }

//   /**
//    * Get comparative analytics between children (for parents)
//    */
//   async function getChildrenComparison(req, res) {
//     try {
//       const { parentId } = req.params;

//       if (!parentId) {
//         return res.status(400).json({
//           success: false,
//           message: 'Parent ID is required'
//         });
//       }

//       const children = await models.Child.findAll({
//         where: { parentId },
//         include: [
//           {
//             model: models.Task,
//             attributes: ['status']
//           },
//           {
//             model: models.Goal,
//             attributes: ['status']
//           },
//           {
//             model: models.Streak,
//             attributes: ['currentStreak', 'lastCompletedDate']
//           }
//         ]
//       });

//       if (children.length === 0) {
//         return res.status(404).json({
//           success: false,
//           message: 'No children found for this parent'
//         });
//       }

//       const comparison = await Promise.all(
//         children.map(async (child) => {
//           const choreStats = await this.getChorePercentages(child.id);
//           const goalStats = await this.getGoalPercentages(child.id);

//           return {
//             id: child.id,
//             name: child.name,
//             age: child.age,
//             coinBalance: child.coinBalance,
//             choreStats,
//             goalStats,
//             currentStreak: child.Streak?.currentStreak || 0,
//             lastActiveDate: child.Streak?.lastCompletedDate
//           };
//         })
//       );

//       return res.status(200).json({
//         success: true,
//         data: {
//           parentId,
//           children: comparison,
//           summary: {
//             totalChildren: children.length,
//             averageCompletionRate: parseFloat(
//               (comparison.reduce((sum, child) => sum + child.choreStats.completed, 0) / children.length).toFixed(2)
//             ),
//             topPerformer: comparison.reduce((top, child) => 
//               child.choreStats.completed > (top?.choreStats?.completed || 0) ? child : top
//             , null)
//           }
//         }
//       });

//     } catch (error) {
//       console.error('Error in getChildrenComparison:', error);
//       return res.status(500).json({
//         success: false,
//         message: 'Internal server error',
//         error: process.env.NODE_ENV === 'development' ? error.message : undefined
//       });
//     }
//   }

//   module.exports = {   getChorePercentages , getGoalPercentages ,getChoreStatusCounts, getGoalStatusCounts,
//     getDailyChores, getPeriodStats, getChildStreak, getChildrenComparison
//   };