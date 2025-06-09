const db = require('../Configs/db/DbConfig');
const taskTemplateModal = require('./taskTemplateModal');

// Import models
const models = {
    Parent: require('./parentModal')(db.sequelize, db.Sequelize.DataTypes),
    Child: require('./childModal')(db.sequelize, db.Sequelize.DataTypes),
    Admin: require('./adminModal')(db.sequelize, db.Sequelize.DataTypes),
    Streak: require('./streakModal')(db.sequelize, db.Sequelize.DataTypes),
    TaskTemplate: require('./taskTemplateModal')(db.sequelize, db.Sequelize.DataTypes),
    Task: require('./taskModal')(db.sequelize, db.Sequelize.DataTypes),
    Notification: require('./notificationModal')(db.sequelize, db.Sequelize.DataTypes),
    Blog: require('./blogModal')(db.sequelize, db.Sequelize.DataTypes),
    Category: require('./product/categoryModal')(db.sequelize, db.Sequelize.DataTypes),
    Product: require('./product/productModal')(db.sequelize, db.Sequelize.DataTypes),
    ProductVariant: require('./product/productVariantModal')(db.sequelize, db.Sequelize.DataTypes),
    ProductLocation: require('./product/productLocationModal')(db.sequelize, db.Sequelize.DataTypes),
    ProductInventory: require('./product/productInventoryModal')(db.sequelize, db.Sequelize.DataTypes),
    // ProductTag: require('./productTagModal')(db.sequelize, db.Sequelize.DataTypes),
    // Tag: require('./tagsModal')(db.sequelize, db.Sequelize.DataTypes),
    // ProductImage: require('./productImageModal')(db.sequelize, db.Sequelize.DataTypes),
    // ProductCategory: require('./productCategoryModal')(db.sequelize, db.Sequelize.DataTypes),
    // ProductVariant: require('./productVariantModal')(db.sequelize, db.Sequelize.DataTypes),
    // ProductVariantOption: require('./productVariantOptionModal')(db.sequelize, db.Sequelize.DataTypes),
    // ProductReview: require('./productReviewModal')(db.sequelize, db.Sequelize.DataTypes),
    // ProductCart: require('./productCartModal')(db.sequelize, db.Sequelize.DataTypes),
    // ProductOrder: require('./productOrderModal')(db.sequelize, db.Sequelize.DataTypes),
    // ProductOrderItem: require('./productOrderItemModal')(db.sequelize, db.Sequelize.DataTypes),
    // ProductWishlist: require('./productWishlistModal')(db.sequelize, db.Sequelize.DataTypes),
    // ProductInventory: require('./productInventoryModal')(db.sequelize, db.Sequelize.DataTypes),
    // ProductCategory: require('./productCategoryModal')(db.sequelize, db.Sequelize.DataTypes),
    // ProductDiscount: require('./productDiscountModal')(db.sequelize, db.Sequelize.DataTypes),

    // Quiz: require('./quizModal')(db.sequelize, db.Sequelize.DataTypes),
    // QuizQuestion: require('./quizQuestionModal')(db.sequelize, db.Sequelize.DataTypes),
    // QuizAttempt: require('./quizAttemptModal')(db.sequelize, db.Sequelize.DataTypes),
    BlogEngagement: require('./blogEngagement')(db.sequelize, db.Sequelize.DataTypes),
    Achievement: require('./achievementModal')(db.sequelize, db.Sequelize.DataTypes),
    // Follower: require('./followerModal')(db.sequelize, db.Sequelize.DataTypes),
    Transaction: require('./transactionModal')(db.sequelize, db.Sequelize.DataTypes),
}
// Define relationships

//-----------------parent child relationships-----------------------------
models.Parent.hasMany(models.Child, {foreignKey: 'parentId',as: 'children',onDelete: 'CASCADE',hooks: true});
models.Child.belongsTo(models.Parent, { foreignKey: 'parentId' , as: 'parent'});
//-----------------parent task relationships---------------------
models.Parent.hasMany(models.Task, { foreignKey: 'parentId' , onDelete: 'CASCADE', hooks: true});
models.Task.belongsTo(models.Parent, { foreignKey: 'parentId' });
//------------------admin task relationships--------------------------------
// models.Admin.hasMany(models.Task, { foreignKey: 'adminId' , onDelete: 'CASCADE', hooks: true});
// models.Task.belongsTo(models.Admin, { foreignKey: 'adminId' });
//-------------------child task relationships-----------------------------------
models.Child.hasMany(models.Task, { foreignKey: 'childId' , onDelete: 'CASCADE', hooks: true});
models.Task.belongsTo(models.Child, { foreignKey: 'childId' });
//------------------parent tasktemplate relation-------------------------------
models.Parent.hasMany(models.TaskTemplate, { foreignKey: 'userId' , onDelete: 'CASCADE', hooks: true});
models.TaskTemplate.belongsTo(models.Parent, { foreignKey: 'userId' });
//------------------admin tasktemplate relation-------------------------------
models.Admin.hasMany(models.TaskTemplate, { foreignKey: 'adminId' , onDelete: 'CASCADE', hooks: true});
models.TaskTemplate.belongsTo(models.Admin, { foreignKey: 'adminId' });
//------------------Task Template relationships-----------------------------------
models.TaskTemplate.hasMany(models.Task, { foreignKey: 'taskTemplateId' });
models.Task.belongsTo(models.TaskTemplate, { foreignKey: 'taskTemplateId' });
//------------------child transaction relationships-----------------------
models.Child.hasMany(models.Transaction, { foreignKey: 'childId' });
models.Transaction.belongsTo(models.Child, { foreignKey: 'childId' });
//------------------task transaction relationships----------------------------------------
models.Task.hasMany(models.Transaction, { foreignKey: 'taskId' });
models.Transaction.belongsTo(models.Task, { foreignKey: 'taskId' });
//-----------------child streak relationships--------------------------------
models.Child.hasOne(models.Streak, { foreignKey: 'childId' , onDelete: 'CASCADE', hooks: true});
models.Streak.belongsTo(models.Child, { foreignKey: 'childId' });
//------------------child blog relationships-------------------------------------
models.Child.hasMany(models.Blog, { foreignKey: 'authorId', as: 'authoredBlogs',  onDelete: 'CASCADE', hooks: true});
models.Blog.belongsTo(models.Child, { foreignKey: 'authorId', as: 'author' });
//------------------parent blog relationships-------------------------------------
models.Parent.hasMany(models.Blog, { foreignKey: 'approvedById' , onDelete: 'CASCADE', hooks: true});
models.Blog.belongsTo(models.Parent, { foreignKey: 'approvedById', as: 'approver' });
//-------------Category <-> Category (Self-referential One-to-Many)--------------------------------
models.Category.hasMany(models.Category, { as: 'subcategories', foreignKey: 'parentId', onDelete: "CASCADE",  hooks: true});
models.Category.belongsTo(models.Category, { as: 'parent', foreignKey: 'parentId'});
//-------------Category <-> Product (One-to-Many)----------------------------------
models.Category.hasMany(models.Product, { foreignKey: 'category_id', as: 'products', onDelete: "CASCADE",  hooks: true});
models.Product.belongsTo(models.Category, { foreignKey: 'category_id', as: 'category' });
//-------------Collection <-> User (One-to-Many)-------------------------------
// db.User.hasMany(db.Collection, { foreignKey: 'user_id', as: 'users' });
// db.Collection.belongsTo(db.User, { foreignKey: 'user_id', as: 'users' });
//------------Collection <-> Product (Many-to-Many)----------------------------------
// db.Collection.belongsToMany(db.Product, {
//     through: "ProductCollection",
//     foreignKey: "collection_id",
//     otherKey: "product_id",
//     as: 'products'
//   });
//   db.Product.belongsToMany(db.Collection, {
//     through: "ProductCollection",
//     foreignKey: "product_id",
//     otherKey: "collection_id",
//     as: 'collections' // Explicitly define the alias
//   });

//---------------------ProductVariant <-> Product-------------------------------------------------
models.Product.hasMany(models.ProductVariant, { foreignKey: "product_id", as: 'variants' });
models.ProductVariant.belongsTo(models.Product, { foreignKey: "product_id", as: 'product' });
//------------------- Tags <-> Product (Many-to-Many)------------------------------------
//   db.Tag.belongsToMany(db.Product, {
//     through: "ProductTag",
//     foreignKey: "tag_id",
//     otherKey: "product_id",
//     as: 'products'
//   });
//   db.Product.belongsToMany(db.Tag, {
//     through: "ProductTag",
//     foreignKey: "product_id",
//     otherKey: "tag_id",
//     as: 'tags' // Explicitly define the alias
//   });
//----------------------ProductVariant <-> Inventory------------------------------------------
models.ProductVariant.hasMany(models.ProductInventory, { foreignKey: "variant_id", as: 'inventories' });
models.ProductInventory.belongsTo(models.ProductVariant, { foreignKey: "variant_id", as: 'variant' });
//------------------Inventory <-> InventoryLocation--------------------------------------------
// Each ProductInventory belongs to one ProductLocation
models.ProductInventory.belongsTo(models.ProductLocation, {
    foreignKey: "location_id",
    as: "location",
  });
  
  // One ProductLocation can have many ProductInventories
  models.ProductLocation.hasMany(models.ProductInventory, {
    foreignKey: "location_id",
    as: "inventories",
  });
//-----------------InventoryLocation <-> Brand (One-to-Many)------------------------------------------
// db.User.hasMany(db.InventoryLocation, {foreignKey: "userId",as: "user"});
// db.InventoryLocation.belongsTo(db.User, {foreignKey: "userId",as: "user"});
// Blog.hasOne(Quiz, { foreignKey: 'blogId' });
// Quiz.belongsTo(Blog, { foreignKey: 'blogId' });

// Quiz.hasMany(QuizQuestion, { foreignKey: 'quizId' });
// QuizQuestion.belongsTo(Quiz, { foreignKey: 'quizId' });

// Quiz.hasMany(QuizAttempt, { foreignKey: 'quizId' });
// QuizAttempt.belongsTo(Quiz, { foreignKey: 'quizId' });
// Child.hasMany(QuizAttempt, { foreignKey: 'childId' });
// QuizAttempt.belongsTo(Child, { foreignKey: 'childId' });

// Blog.hasMany(BlogEngagement, { foreignKey: 'blogId' });
// BlogEngagement.belongsTo(Blog, { foreignKey: 'blogId' });
// Child.hasMany(BlogEngagement, { foreignKey: 'childId' });
// BlogEngagement.belongsTo(Child, { foreignKey: 'childId' });

// Child.hasMany(Achievement, { foreignKey: 'childId' });
// Achievement.belongsTo(Child, { foreignKey: 'childId' });

// Child.hasMany(Follower, { as: 'followers', foreignKey: 'followingId' });
// Child.hasMany(Follower, { as: 'following', foreignKey: 'followerId' });
// Follower.belongsTo(Child, { as: 'follower', foreignKey: 'followerId' });
// Follower.belongsTo(Child, { as: 'following', foreignKey: 'followingId' });
// Parent.hasMany(Follower, { foreignKey: 'approvedById' });
// Follower.belongsTo(Parent, { foreignKey: 'approvedById' });

models.db = db;
module.exports = models;