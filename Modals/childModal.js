module.exports = (sequelize, DataTypes) => {
const Child = sequelize.define('Child', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true // Can be null if using parent device
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    age: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 5,
        max: 16
      }
    },
    profilePicture: {
      type: DataTypes.STRING,
      allowNull: true
    },
    coinBalance: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    hasBlogAccess: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    deviceSharingMode: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  },
 {
    timestamps: true
  });
  return Child;
};