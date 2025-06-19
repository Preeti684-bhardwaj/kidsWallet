module.exports = (sequelize, DataTypes) => {
  const Task = sequelize.define('Task', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    dueDate: {
      type: DataTypes.DATE,                               
      allowNull: true
    },
    dueTime: {
      type: DataTypes.STRING, // Store as "HH:MM" format
      allowNull: true,
      validate: {
        is: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // duration: {
    //   type: DataTypes.INTEGER, // Duration in minutes
    //   allowNull: false,
    //   validate: {
    //     min: { args: 1, msg: 'Duration must be at least 1 minute' },
    //   },
    // },
    recurrence: {
      type: DataTypes.ENUM('ONCE', 'DAILY', 'WEEKLY', 'MONTHLY'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('UPCOMING','PENDING', 'COMPLETED', 'APPROVED', 'REJECTED', 'OVERDUE'),
      defaultValue: 'PENDING',
    },
    rewardCoins: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
      // validate: {
      //   min: { args: 0, msg: 'Reward coins cannot be negative' },
      // },
    },
    // difficulty: {
    //   type: DataTypes.ENUM('EASY', 'MEDIUM', 'HARD'),
    //   allowNull: false,
    //   defaultValue: 'EASY',
    // },
    isRecurring: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
  },
  {
    timestamps: true,
  });
  
  return Task;
}