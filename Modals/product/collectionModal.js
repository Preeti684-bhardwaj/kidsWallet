module.exports = (sequelize, DataTypes) => {
    const Collection = sequelize.define(
      "Collection",
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        name: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        image: {
          type: DataTypes.JSON,
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        seo_title: {
          type: DataTypes.STRING
        },
        seo_description: {
          type: DataTypes.TEXT
        },
        is_active: {
          type: DataTypes.BOOLEAN,
          defaultValue: true
        }
      },
      {
        timestamps: true,
      }
    );
  
    return Collection;
  };
  