module.exports = (sequelize, DataTypes) => {
    const Tag = sequelize.define(
      "Tag",
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        name: {
          type: DataTypes.STRING,
          allowNull: false,
          unique: true,
        },
      },
      {
        timestamps: true,
      }
    );
  
    return Tag;
  };
  