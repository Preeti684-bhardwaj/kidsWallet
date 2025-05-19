module.exports = (sequelize, DataTypes) => {
    const TaskTemplate = sequelize.define('TaskTemplate', {
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
      image: {
        type: DataTypes.STRING, // URL or path to image
        allowNull: true
      }
    },
    {
      timestamps: true,
    });
    
    return TaskTemplate;
  }