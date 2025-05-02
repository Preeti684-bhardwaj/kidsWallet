module.exports = (sequelize, DataTypes) => {
const Streak = sequelize.define('Streak', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    currentStreak: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    lastCompletedDate: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
{
    timestamps: true
});
  return Streak;
}
  