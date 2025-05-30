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