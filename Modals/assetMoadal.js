module.exports = (sequelize, DataTypes) => {
    const Asset = sequelize.define("Asset", {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      assetData: DataTypes.JSON,
    },
    {
        timestamps: true,
    }
);
    return Asset;
  };
  