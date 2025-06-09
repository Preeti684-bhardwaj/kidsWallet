module.exports = (sequelize, DataTypes) => {
    const Category = sequelize.define('Category', {
      id : {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      description: {
        type: DataTypes.TEXT
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      image: {
        type: DataTypes.JSON,
      },
    },
  {
    timestamps: true,
  });
  
    return Category;
  };