module.exports = (sequelize, DataTypes) => {
  const Task = sequelize.define('Task', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    coinReward: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    difficultyLevel: {
      type: DataTypes.ENUM('easy', 'medium', 'hard'),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('assigned', 'completed', 'approved', 'rejected'),
      defaultValue: 'assigned'
    },
    statusReason: {
      type: DataTypes.TEXT,
      allowNull: true
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
    duration: {
      type: DataTypes.INTEGER, // Duration in minutes (5, 15, 30, 60, 120)
      allowNull: true,
      validate: {
        isIn: [[5, 15, 30, 60, 120]]
      }
    },
    isRecurring: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    recurringFrequency: {
      type: DataTypes.ENUM('daily', 'weekly', 'monthly'),
      allowNull: true
    },
    parentTaskId: { // To link recurring instances to the original task
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Tasks',
        key: 'id'
      }
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true 
    }
  },
  {
    timestamps: true,
  });
  
  return Task;
}