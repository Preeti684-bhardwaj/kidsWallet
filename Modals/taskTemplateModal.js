module.exports = (sequelize, DataTypes) => {
    const TaskTemplate = sequelize.define('TaskTemplate', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: 'Title cannot be empty' },
          len: { args: [2, 100], msg: 'Title must be between 2 and 100 characters' },
        },
      },
      // description: {
      //   type: DataTypes.TEXT,
      //   allowNull: true,
      // },
      image: {
        type: DataTypes.JSON,
        allowNull: true,
        // validate: {
        //   isUrl: { msg: 'Image must be a valid URL' },
        // },
      }
    },
    {
      timestamps: true,
    });
    
    return TaskTemplate;
  }