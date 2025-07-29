module.exports = (sequelize, DataTypes) => {
  const Transaction = sequelize.define(
    "Transaction",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM(
          "task_reward",
          "streak_bonus",
          "credit",
          "blog_reward",
          "quiz_reward",
          "spending",
          "investment"
        ),
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      // New fields for tracking earnings and balance
      totalEarned: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Cumulative total of all coins earned by the child (never decreases)"
      },
      coinBalance: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Current coin balance after all transactions (can increase/decrease)"
      }
    },
    {
      timestamps: true,
    }
  );
  return Transaction;
};