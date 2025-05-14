module.exports = (sequelize, DataTypes) => {
const Blog = sequelize.define('Blog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    isPublished: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    isApproved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    readCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    likeCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    commentCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    ageGroup: {
      type: DataTypes.ENUM('5-7', '8-10', '11-13', '14-16', 'all'),
      defaultValue: 'all'
    },
    category: {
      type: DataTypes.ENUM('saving', 'earning', 'investing', 'financial_goals', 'chores', 'other'),
      allowNull: false
    },
    hasVideo: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    videoUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },
    isFeatured: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
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
  return Blog;
}