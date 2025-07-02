module.exports = (sequelize, DataTypes) => {
  const Goal = sequelize.define(
    "Goal",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "Title cannot be empty" },
          len: {
            args: [2, 100],
            msg: "Title must be between 2 and 100 characters",
          },
        },
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      image: {
        type: DataTypes.JSON,
        allowNull: true,
        // validate: {
        //   isUrl: { msg: 'Image must be a valid URL' },
        // },
      },
      type: {
        type: DataTypes.ENUM("TASK", "COIN"),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(
          "PENDING",
          "COMPLETED",
          "APPROVED",
          "REJECTED"
        ),
        defaultValue: "PENDING",
      },
      completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      approvedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      rejectedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      rejectionReason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      timestamps: true,
    }
  );

  return Goal;
};
