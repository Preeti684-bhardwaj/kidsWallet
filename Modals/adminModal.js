module.exports = (sequelize, DataTypes) => {
    const Admin = sequelize.define("Admin", {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    //   countryCode: {
    //     type: DataTypes.STRING,
    //   },
    //   phone:{
    //     type: DataTypes.STRING,
    //   },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      isEmailVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      }
    },
    {
        timestamps: true,
    }
);
    return Admin;
  };
  