module.exports = (sequelize, DataTypes) => {
const Notification = sequelize.define('Notification', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    type: {
      type: DataTypes.ENUM('task_reminder','task_update', 'task_deletion','task_rejection','task_completion','reward_update', 'task_approval', 'streak_bonus','blog_approval', 'achievement', 'follower_request'),
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    recipientType: {
      type: DataTypes.ENUM('parent', 'child'),
      allowNull: false
    },
    recipientId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    relatedItemType: {
      type: DataTypes.ENUM('task', 'blog', 'quiz', 'achievement', 'follower'),
      allowNull: true
    },
    relatedItemId: {
      type: DataTypes.UUID,
      allowNull: true
    }
  },
{
    timestamps: true
});
return Notification;
}