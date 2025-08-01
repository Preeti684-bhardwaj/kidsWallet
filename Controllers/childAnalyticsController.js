const { Op } = require('sequelize');
const models = require('../Modals/index'); // Adjust path as needed
const { getChildCoinStats } = require('../Utils/transactionHelper');

class ChildAnalyticsController {
  
  /**
   * Get comprehensive analytics for a child
   * GET /api/analytics/child/:childId
   */
  async getChildAnalytics(req, res) {
    try {
      const { childId } = req.params;
      const { 
        date = new Date().toISOString().split('T')[0], // Default to today
        period = 'day' // day, week, month
      } = req.query;

      // Validate childId
      if (!childId) {
        return res.status(400).json({
          success: false,
          message: 'Child ID is required'
        });
      }

      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format. Use YYYY-MM-DD'
        });
      }

      // Validate period
      if (!['day', 'week', 'month'].includes(period)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid period. Use day, week, or month'
        });
      }

      // Check if child exists
      const child = await models.Child.findByPk(childId);
      if (!child) {
        return res.status(404).json({
          success: false,
          message: 'Child not found'
        });
      }

      const parent = await models.Parent.findByPk(child.parentId, {
        attributes: ['id', 'name', 'email', 'image']
      });

      // Get coin statistics
      const coinStats = await getChildCoinStats(childId);

      // Get all analytics data
      const [
        choreStats,
        goalStats,
        choreStatusCounts,
        goalStatusCounts,
        dailyChores,
        periodStats,
        transactionHistory
      ] = await Promise.all([
        this.getChorePercentages(childId),
        this.getGoalPercentages(childId),
        this.getChoreStatusCounts(childId),
        this.getGoalStatusCounts(childId),
        this.getDailyChores(childId, date),
        this.getPeriodStats(childId, period),
        this.getRecentTransactions(childId, 10) // Get last 10 transactions
      ]);

      const analytics = {
        childInfo: {
          id: child.id,
          name: child.name,
          age: child.age,
          profilePicture: child.profilePicture,
          coinBalance: coinStats.coinBalance, // From transaction history
          totalEarned: coinStats.totalEarned, // From transaction history
          parent: parent
        },
        coinStats: {
          currentBalance: coinStats.coinBalance,
          totalEarned: coinStats.totalEarned,
          totalSpent: coinStats.totalEarned - coinStats.coinBalance // Calculated difference
        },
        chorePercentages: choreStats,
        goalPercentages: goalStats,
        choreCounts: choreStatusCounts,
        goalCounts: goalStatusCounts,
        dailyChores: dailyChores,
        periodAnalytics: periodStats,
        recentTransactions: transactionHistory,
        generatedAt: new Date().toISOString()
      };

      return res.status(200).json({
        success: true,
        data: analytics
      });

    } catch (error) {
      console.error('Error in getChildAnalytics:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

    /**
   * Get recent transactions for a child
   */
    async getRecentTransactions(childId, limit = 10) {
      try {
        const transactions = await models.Transaction.findAll({
          where: { childId },
          include: [
            {
              model: models.Task,
              attributes: ['id'],
              include: [
                {
                  model: models.TaskTemplate,
                  attributes: ['title', 'image']
                }
              ],
              required: false
            }
          ],
          attributes: [
            'id', 'type', 'description', 'totalEarned', 
            'coinBalance', 'createdAt'
          ],
          order: [['createdAt', 'DESC']],
          limit: limit
        });
  
        return transactions.map(transaction => ({
          id: transaction.id,
          // amount: transaction.amount,
          type: transaction.type,
          description: transaction.description,
          totalEarned: transaction.totalEarned,
          coinBalance: transaction.coinBalance,
          createdAt: transaction.createdAt,
          task: transaction.Task ? {
            id: transaction.Task.id,
            title: transaction.Task.TaskTemplate?.title
          } : null
        }));
  
      } catch (error) {
        console.error('Error in getRecentTransactions:', error);
        throw error;
      }
    }

    
  /**
   * Get chore completion and rejection percentages
   */
  async getChorePercentages(childId) {
    try {
      const totalChores = await models.Task.count({
        where: { childId }
      });

      if (totalChores === 0) {
        return {
          completed: 0,
          rejected: 0,
          approved: 0,
          pending: 0,
          overdue: 0,
          upcoming: 0,
          total: 0
        };
      }

      const statusCounts = await models.Task.findAll({
        where: { childId },
        attributes: [
          'status',
          [models.db.sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['status'],
        raw: true
      });

      const counts = {
        COMPLETED: 0,
        REJECTED: 0,
        APPROVED: 0,
        PENDING: 0,
        OVERDUE: 0,
        UPCOMING: 0
      };

      statusCounts.forEach(item => {
        counts[item.status] = parseInt(item.count);
      });

      return {
        completed: parseFloat(((counts.COMPLETED / totalChores) * 100).toFixed(2)),
        rejected: parseFloat(((counts.REJECTED / totalChores) * 100).toFixed(2)),
        approved: parseFloat(((counts.APPROVED / totalChores) * 100).toFixed(2)),
        pending: parseFloat(((counts.PENDING / totalChores) * 100).toFixed(2)),
        overdue: parseFloat(((counts.OVERDUE / totalChores) * 100).toFixed(2)),
        upcoming: parseFloat(((counts.UPCOMING / totalChores) * 100).toFixed(2)),
        total: totalChores
      };

    } catch (error) {
      console.error('Error in getChorePercentages:', error);
      throw error;
    }
  }

  /**
   * Get goal completion and rejection percentages
   */
  async getGoalPercentages(childId) {
    try {
      const totalGoals = await models.Goal.count({
        where: { childId }
      });

      if (totalGoals === 0) {
        return {
          completed: 0,
          rejected: 0,
          approved: 0,
          pending: 0,
          total: 0
        };
      }

      const statusCounts = await models.Goal.findAll({
        where: { childId },
        attributes: [
          'status',
          [models.db.sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['status'],
        raw: true
      });

      const counts = {
        COMPLETED: 0,
        REJECTED: 0,
        APPROVED: 0,
        PENDING: 0
      };

      statusCounts.forEach(item => {
        counts[item.status] = parseInt(item.count);
      });

      return {
        completed: parseFloat(((counts.COMPLETED / totalGoals) * 100).toFixed(2)),
        rejected: parseFloat(((counts.REJECTED / totalGoals) * 100).toFixed(2)),
        approved: parseFloat(((counts.APPROVED / totalGoals) * 100).toFixed(2)),
        pending: parseFloat(((counts.PENDING / totalGoals) * 100).toFixed(2)),
        total: totalGoals
      };

    } catch (error) {
      console.error('Error in getGoalPercentages:', error);
      throw error;
    }
  }

  /**
   * Get chore status counts
   */
  async getChoreStatusCounts(childId) {
    try {
      const statusCounts = await models.Task.findAll({
        where: { childId },
        attributes: [
          'status',
          [models.db.sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['status'],
        raw: true
      });

      const counts = {
        completed: 0,
        rejected: 0,
        approved: 0,
        pending: 0,
        overdue: 0,
        upcoming: 0,
        total: 0
      };

      statusCounts.forEach(item => {
        const status = item.status.toLowerCase();
        counts[status] = parseInt(item.count);
        counts.total += parseInt(item.count);
      });

      return counts;

    } catch (error) {
      console.error('Error in getChoreStatusCounts:', error);
      throw error;
    }
  }

  /**
   * Get goal status counts
   */
  async getGoalStatusCounts(childId) {
    try {
      const statusCounts = await models.Goal.findAll({
        where: { childId },
        attributes: [
          'status',
          [models.db.sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['status'],
        raw: true
      });

      const counts = {
        completed: 0,
        rejected: 0,
        approved: 0,
        pending: 0,
        total: 0
      };

      statusCounts.forEach(item => {
        const status = item.status.toLowerCase();
        counts[status] = parseInt(item.count);
        counts.total += parseInt(item.count);
      });

      return counts;

    } catch (error) {
      console.error('Error in getGoalStatusCounts:', error);
      throw error;
    }
  }

  /**
   * Get daily chores with template details
   */
  async getDailyChores(childId, date) {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const chores = await models.Task.findAll({
        where: {
          childId,
          [Op.or]: [
            {
              dueDate: {
                [Op.between]: [startOfDay, endOfDay]
              }
            },
            {
              createdAt: {
                [Op.between]: [startOfDay, endOfDay]
              }
            }
          ]
        },
        include: [
          {
            model: models.TaskTemplate,
            attributes: ['id', 'title', 'image']
          }
        ],
        attributes: [
          'id', 'status', 'rewardCoins', 'dueDate', 'dueTime', 
          'description', 'completedAt', 'approvedAt', 'rejectedAt',
          'rejectionReason', 'createdAt'
        ],
        order: [['dueTime', 'ASC'], ['createdAt', 'ASC']]
      });

      return chores.map(chore => ({
        id: chore.id,
        status: chore.status,
        rewardCoins: chore.rewardCoins,
        dueDate: chore.dueDate,
        dueTime: chore.dueTime,
        description: chore.description,
        completedAt: chore.completedAt,
        approvedAt: chore.approvedAt,
        rejectedAt: chore.rejectedAt,
        rejectionReason: chore.rejectionReason,
        template: chore.TaskTemplate ? {
          id: chore.TaskTemplate.id,
          title: chore.TaskTemplate.title,
          image: chore.TaskTemplate.image
        } : null
      }));

    } catch (error) {
      console.error('Error in getDailyChores:', error);
      throw error;
    }
  }

  /**
   * Get period statistics for bar graph
   */
  async getPeriodStats(childId, period) {
    try {
      const now = new Date();
      let startDate, endDate, groupBy;

      switch (period) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          endDate = now;
          groupBy = models.db.sequelize.fn('to_char', 
            models.db.sequelize.col('completedAt'), 
            'YYYY-MM-DD'
          );
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          groupBy = models.db.sequelize.fn('to_char', 
            models.db.sequelize.col('completedAt'), 
            'YYYY-MM-DD'
          );
          break;
        default: // day
          startDate = new Date(now.setHours(0, 0, 0, 0));
          endDate = new Date(now.setHours(23, 59, 59, 999));
          groupBy = models.db.sequelize.fn('date_part', 
            'hour',
            models.db.sequelize.col('completedAt')
          );
      }

      // Get completed tasks
      const completedStats = await models.Task.findAll({
        where: {
          childId,
          status: 'COMPLETED',
          completedAt: {
            [Op.between]: [startDate, endDate]
          }
        },
        attributes: [
          [groupBy, 'period'],
          [models.db.sequelize.fn('COUNT', models.db.sequelize.col('*')), 'count']
        ],
        group: [groupBy],
        raw: true,
        order: [[groupBy, 'ASC']]
      });

      // Get rejected tasks
      const rejectedStats = await models.Task.findAll({
        where: {
          childId,
          status: 'REJECTED',
          rejectedAt: {
            [Op.between]: [startDate, endDate]
          }
        },
        attributes: [
          [
            models.db.sequelize.fn('to_char', 
              models.db.sequelize.col('rejectedAt'), 
              'YYYY-MM-DD'
            ), 
            'period'
          ],
          [models.db.sequelize.fn('COUNT', models.db.sequelize.col('*')), 'count']
        ],
        group: [models.db.sequelize.fn('to_char', models.db.sequelize.col('rejectedAt'), 'YYYY-MM-DD')],
        raw: true,
        order: [[models.db.sequelize.fn('to_char', models.db.sequelize.col('rejectedAt'), 'YYYY-MM-DD'), 'ASC']]
      });

      // Format the data
      return {
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        completed: completedStats.map(item => ({
          period: period === 'day' ? 
            String(Math.floor(Number(item.period))).padStart(2, '0') : // Format hour as "00"-"23"
            item.period,
          count: parseInt(item.count)
        })),
        rejected: rejectedStats.map(item => ({
          period: item.period,
          count: parseInt(item.count)
        }))
      };

    } catch (error) {
      console.error('Error in getPeriodStats:', error);
      throw error;
    }
  }

  /**
   * Get child streak information
   */
  async getChildStreak(req, res) {
    try {
      const { childId } = req.params;

      if (!childId) {
        return res.status(400).json({
          success: false,
          message: 'Child ID is required'
        });
      }

      const streak = await models.Streak.findOne({
        where: { childId },
        include: [
          {
            model: models.Child,
            attributes: ['name', 'coinBalance']
          }
        ]
      });

      if (!streak) {
        return res.status(404).json({
          success: false,
          message: 'Streak data not found for this child'
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          currentStreak: streak.currentStreak,
          lastCompletedDate: streak.lastCompletedDate,
          child: streak.Child
        }
      });

    } catch (error) {
      console.error('Error in getChildStreak:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = new ChildAnalyticsController();

    /**
     * Get earning statistics by type
     */
    // async getEarningsByType(childId) {
    //   try {
    //     const earningTypes = ['task_reward', 'streak_bonus', 'credit', 'blog_reward', 'quiz_reward'];
        
    //     const earnings = await models.Transaction.findAll({
    //       where: {
    //         childId,
    //         type: {
    //           [Op.in]: earningTypes
    //         }
    //       },
    //       attributes: [
    //         'type',
    //         [models.db.sequelize.fn('SUM', models.db.sequelize.col('amount')), 'totalAmount'],
    //         [models.db.sequelize.fn('COUNT', '*'), 'count']
    //       ],
    //       group: ['type'],
    //       raw: true
    //     });
  
    //     const earningsBreakdown = {
    //       task_reward: { amount: 0, count: 0 },
    //       streak_bonus: { amount: 0, count: 0 },
    //       credit: { amount: 0, count: 0 },
    //       blog_reward: { amount: 0, count: 0 },
    //       quiz_reward: { amount: 0, count: 0 }
    //     };
  
    //     earnings.forEach(earning => {
    //       earningsBreakdown[earning.type] = {
    //         amount: parseInt(earning.totalAmount),
    //         count: parseInt(earning.count)
    //       };
    //     });
  
    //     return earningsBreakdown;
  
    //   } catch (error) {
    //     console.error('Error in getEarningsByType:', error);
    //     throw error;
    //   }
    // }
  
    /**
     * Get spending statistics by type
     */
    // async getSpendingByType(childId) {
    //   try {
    //     const spendingTypes = ['spending', 'investment'];
        
    //     const spending = await models.Transaction.findAll({
    //       where: {
    //         childId,
    //         type: {
    //           [Op.in]: spendingTypes
    //         }
    //       },
    //       attributes: [
    //         'type',
    //         [models.db.sequelize.fn('SUM', models.db.sequelize.col('amount')), 'totalAmount'],
    //         [models.db.sequelize.fn('COUNT', '*'), 'count']
    //       ],
    //       group: ['type'],
    //       raw: true
    //     });
  
    //     const spendingBreakdown = {
    //       spending: { amount: 0, count: 0 },
    //       investment: { amount: 0, count: 0 }
    //     };
  
    //     spending.forEach(spend => {
    //       spendingBreakdown[spend.type] = {
    //         amount: Math.abs(parseInt(spend.totalAmount)), // Make positive for display
    //         count: parseInt(spend.count)
    //       };
    //     });
  
    //     return spendingBreakdown;
  
    //   } catch (error) {
    //     console.error('Error in getSpendingByType:', error);
    //     throw error;
    //   }
    // }


  /**
   * Get comparative analytics between children (for parents)
   */
  // async getChildrenComparison(req, res) {
  //   try {
  //     const { parentId } = req.params;

  //     if (!parentId) {
  //       return res.status(400).json({
  //         success: false,
  //         message: 'Parent ID is required'
  //       });
  //     }

  //     const children = await models.Child.findAll({
  //       where: { parentId },
  //       include: [
  //         {
  //           model: models.Task,
  //           attributes: ['status']
  //         },
  //         {
  //           model: models.Goal,
  //           attributes: ['status']
  //         },
  //         {
  //           model: models.Streak,
  //           attributes: ['currentStreak', 'lastCompletedDate']
  //         }
  //       ]
  //     });

  //     if (children.length === 0) {
  //       return res.status(404).json({
  //         success: false,
  //         message: 'No children found for this parent'
  //       });
  //     }

  //     const comparison = await Promise.all(
  //       children.map(async (child) => {
  //         const choreStats = await this.getChorePercentages(child.id);
  //         const goalStats = await this.getGoalPercentages(child.id);

  //         return {
  //           id: child.id,
  //           name: child.name,
  //           age: child.age,
  //           coinBalance: child.coinBalance,
  //           choreStats,
  //           goalStats,
  //           currentStreak: child.Streak?.currentStreak || 0,
  //           lastActiveDate: child.Streak?.lastCompletedDate
  //         };
  //       })
  //     );

  //     return res.status(200).json({
  //       success: true,
  //       data: {
  //         parentId,
  //         children: comparison,
  //         summary: {
  //           totalChildren: children.length,
  //           averageCompletionRate: parseFloat(
  //             (comparison.reduce((sum, child) => sum + child.choreStats.completed, 0) / children.length).toFixed(2)
  //           ),
  //           topPerformer: comparison.reduce((top, child) => 
  //             child.choreStats.completed > (top?.choreStats?.completed || 0) ? child : top
  //           , null)
  //         }
  //       }
  //     });

  //   } catch (error) {
  //     console.error('Error in getChildrenComparison:', error);
  //     return res.status(500).json({
  //       success: false,
  //       message: 'Internal server error',
  //       error: process.env.NODE_ENV === 'development' ? error.message : undefined
  //     });
  //   }
  // }

// Additional utility functions for advanced analytics

/**
 * Get productivity insights
 */
// const getProductivityInsights = async (childId) => {
//   try {
//     const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
//     const completedTasks = await models.Task.findAll({
//       where: {
//         childId,
//         status: 'COMPLETED',
//         completedAt: {
//           [Op.gte]: last30Days
//         }
//       },
//       attributes: [
//         [models.db.sequelize.fn('DATE', models.db.sequelize.col('completedAt')), 'date'],
//         [models.db.sequelize.fn('COUNT', '*'), 'count'],
//         [models.db.sequelize.fn('AVG', models.db.sequelize.col('rewardCoins')), 'avgCoins']
//       ],
//       group: [models.db.sequelize.fn('DATE', models.db.sequelize.col('completedAt'))],
//       raw: true
//     });

//     const insights = {
//       averageTasksPerDay: completedTasks.length > 0 ? 
//         parseFloat((completedTasks.reduce((sum, day) => sum + parseInt(day.count), 0) / completedTasks.length).toFixed(2)) : 0,
//       averageCoinsPerTask: completedTasks.length > 0 ?
//         parseFloat((completedTasks.reduce((sum, day) => sum + parseFloat(day.avgCoins), 0) / completedTasks.length).toFixed(2)) : 0,
//       mostProductiveDay: completedTasks.reduce((best, day) => 
//         parseInt(day.count) > parseInt(best?.count || 0) ? day : best
//       , null),
//       consistency: completedTasks.length / 30 // What percentage of days had at least one completed task
//     };

//     return insights;
//   } catch (error) {
//     console.error('Error in getProductivityInsights:', error);
//     throw error;
//   }
// };

/**
 * Route definitions
 */
/*
// Add these routes to your router file

const express = require('express');
const router = express.Router();
const childAnalyticsController = require('./childAnalyticsController');

// Get comprehensive child analytics
router.get('/child/:childId', childAnalyticsController.getChildAnalytics);

// Get child streak information
router.get('/child/:childId/streak', childAnalyticsController.getChildStreak);

// Get children comparison for parents
router.get('/parent/:parentId/children-comparison', childAnalyticsController.getChildrenComparison);

module.exports = router;
*/