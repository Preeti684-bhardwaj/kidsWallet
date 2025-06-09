module.exports = (sequelize, DataTypes) => {
    const InventoryLocation = sequelize.define(
      "InventoryLocation",
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
          allowNull: false,
        },
        name: {
          type: DataTypes.STRING(100),
          allowNull: false,
          validate: {
            notEmpty: { msg: 'Name cannot be empty' },
            len: { args: [1, 100], msg: 'Name must be between 1 and 100 characters' },
          },
        },
        address: {
          type: DataTypes.STRING(255),
          allowNull: true,
          validate: {
            len: { args: [0, 255], msg: 'Address must be 255 characters or less' },
          },
        },
        pincode: {
          type: DataTypes.STRING(20),
          allowNull: true,
          validate: {
            notEmpty: { msg: 'Pincode cannot be empty' },
            len: { args: [3, 20], msg: 'Pincode must be between 3 and 20 characters' },
          },
        },
        city: {
          type: DataTypes.STRING(50),
          allowNull: true,
          validate: {
            len: { args: [0, 50], msg: 'City must be 50 characters or less' },
          },
        },
        state: {
          type: DataTypes.STRING(50),
          allowNull: true,
          validate: {
            len: { args: [0, 50], msg: 'State must be 50 characters or less' },
          },
        },
        country: {
          type: DataTypes.STRING(50),
          allowNull: false,
          defaultValue: 'India', // Adjust based on your default region
          validate: {
            notEmpty: { msg: 'Country cannot be empty' },
            len: { args: [1, 50], msg: 'Country must be 50 characters or less' },
          },
        },
        phone: {
          type: DataTypes.STRING(20),
          allowNull: true,
          validate: {
            len: { args: [0, 20], msg: 'Phone must be 20 characters or less' },
            is: { args: [/^[\d\s-+]*$/], msg: 'Phone must contain only digits, spaces, or +-' },
          },
        },
        is_active: {
          type: DataTypes.BOOLEAN,
          defaultValue: true,
        },
      },
      {
        timestamps: true
      }
    );
  
    return InventoryLocation;
  };
  