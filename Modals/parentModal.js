module.exports = (sequelize, DataTypes) => {
    const Parent = sequelize.define("Parent", {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: DataTypes.STRING,
      email: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      image :{
        type: DataTypes.JSON,
        allowNull: true
      },
      gender :{
        type: DataTypes.ENUM('male','female','other'),
        allowNull: true
      },
      countryCode: {
        type: DataTypes.STRING,
      },
      phone:{
        type: DataTypes.STRING,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      otp: DataTypes.STRING,
      otpExpire: DataTypes.DATE,
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      googleUserId: {
        type: DataTypes.STRING,
        unique: true,
      },
      authProvider: {
        type: DataTypes.ENUM("local","google"),
        defaultValue: "local",
      },
      isEmailVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      country:{
        type: DataTypes.STRING,
        allowNull: true,
      },
      currency:{
        type: DataTypes.STRING,
        allowNull: true,
      }
    },
    {
        timestamps: true,
    }
);
    return Parent;
  };
  