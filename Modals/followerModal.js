const Follower = sequelize.define('Follower', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    followerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Children',
        key: 'id'
      }
    },
    followingId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Children',
        key: 'id'
      }
    },
    approved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    approvedById: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Parents',
        key: 'id'
      }
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false
    }
  });