module.exports = (sequelize, DataTypes) => {
    const ProductVariant = sequelize.define(
      "ProductVariant",
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        images: {
          type: DataTypes.ARRAY(DataTypes.JSON),
          allowNull: true,
        },
        barcode: {
          type: DataTypes.STRING,
        },
        price: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
        },
        compare_at_price: {
          type: DataTypes.DECIMAL(10, 2),
        },
        weight: {
          type: DataTypes.DECIMAL(10, 2),
        },
        weight_unit: {
          type: DataTypes.ENUM("g", "kg", "oz", "lb"),
          defaultValue: "g",
        },
        requires_shipping: {
          type: DataTypes.BOOLEAN,
          defaultValue: true, // true = physical, false = digital
        },
        origin_country: {
          type: DataTypes.STRING,
          allowNull: true, // or false if always required
        },
        is_taxable: {
          type: DataTypes.BOOLEAN,
          defaultValue: true,
        },
        attributes: {
          type: DataTypes.ARRAY(DataTypes.JSON),
          allowNull: false,
        },
        is_active: {
          type: DataTypes.BOOLEAN,
          defaultValue: true,
        },
        max_quantity_per_order: {
          type: DataTypes.INTEGER,
          defaultValue: 100,
        },
      },
      {
        timestamps: true,
      }
    );
  
    return ProductVariant;
  };
  