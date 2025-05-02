const Achievement = sequelize.define('Achievement', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    childId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Children',
        key: 'id'
      }
    },
    type: {
      type: DataTypes.ENUM('first_blog', 'read_milestone', 'follow_milestone', 'task_streak', 'savings_goal'),
      allowNull: false
    },
    milestone: {
      type: DataTypes.STRING,
      allowNull: false
    },
    badgeAwarded: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    coinReward: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false
    }
  });