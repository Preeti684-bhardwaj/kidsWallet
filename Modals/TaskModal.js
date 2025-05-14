module.exports = (sequelize, DataTypes) => {
const Task = sequelize.define('Task', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
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
    dueDate: {
      type: DataTypes.DATE,                               
      allowNull: true
    },
    duration: {
      type: DataTypes.INTEGER, // Duration in minutes
      allowNull: true,
      comment: 'Task duration in minutes (5, 15, 30, 60, 120, etc.)'
    },
    isRecurring: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    recurringFrequency: {
      type: DataTypes.ENUM('daily', 'weekly', 'monthly'),
      allowNull: true
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