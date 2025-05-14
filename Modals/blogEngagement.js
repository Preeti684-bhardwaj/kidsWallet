module.exports = (sequelize, DataTypes) => {
const BlogEngagement = sequelize.define('BlogEngagement', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    blogId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Blogs',
        key: 'id'
      }
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
      type: DataTypes.ENUM('read', 'like', 'comment', 'share'),
      allowNull: false
    },
    comment: {
      type: DataTypes.TEXT,
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
}