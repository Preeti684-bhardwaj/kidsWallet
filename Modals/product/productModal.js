module.exports = (sequelize, DataTypes) => {
    const Product = sequelize.define(
      "Product",
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
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        images: {
          type:DataTypes.ARRAY(DataTypes.JSON),
          allowNull: true
        },
        type: {
          type: DataTypes.STRING
        },
        vendor: {
          type: DataTypes.STRING
        },
        seo_title: {
          type: DataTypes.STRING
        },
        seo_description: {
          type: DataTypes.TEXT
        },
        status: {
          type: DataTypes.ENUM('active', 'draft', 'archived'),
          defaultValue: 'draft'
        },
        specifications: {
          type: DataTypes.JSON,
          allowNull: true
        },
      },
      {
        timestamps: true,
      }
    );
  
    return Product;
  };
  