module.exports = (sequelize, DataTypes) => {
    const Inventory = sequelize.define(
      "Inventory",
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        reservedQuantity: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: 0,
        },
        quantity: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          validate: {
            min: 0,
          },
        },
      },
      {
        timestamps: true,
      }
    );
  
    return Inventory;
  };
  