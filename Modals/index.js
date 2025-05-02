const db = require('../Configs/db/DbConfig');

// Import models
const models = {
    Parent: require('./parentModal')(db.sequelize, db.Sequelize.DataTypes),
    Child: require('./childModal')(db.sequelize, db.Sequelize.DataTypes),
    Chore: require('./TaskModal')(db.sequelize, db.Sequelize.DataTypes),
    Streak: require('./streakModal')(db.sequelize, db.Sequelize.DataTypes),
    Task: require('./TaskModal')(db.sequelize, db.Sequelize.DataTypes),
    Notification: require('./notificationModal')(db.sequelize, db.Sequelize.DataTypes),
    // Blog: require('./blogModal')(db.sequelize, db.Sequelize.DataTypes),
    // Quiz: require('./quizModal')(db.sequelize, db.Sequelize.DataTypes),
    // QuizQuestion: require('./quizQuestionModal')(db.sequelize, db.Sequelize.DataTypes),
    // QuizAttempt: require('./quizAttemptModal')(db.sequelize, db.Sequelize.DataTypes),
    // BlogEngagement: require('./blogEngagementModal')(db.sequelize, db.Sequelize.DataTypes),
    // Achievement: require('./achievementModal')(db.sequelize, db.Sequelize.DataTypes),
    // Follower: require('./followerModal')(db.sequelize, db.Sequelize.DataTypes),
    Transaction: require('./transactionModal')(db.sequelize, db.Sequelize.DataTypes),
}
// Define relationships
models.Parent.hasMany(models.Child, { foreignKey: 'parentId' });
models.Child.belongsTo(models.Parent, { foreignKey: 'parentId' });

models.Parent.hasMany(models.Task, { foreignKey: 'parentId' });
models.Child.hasMany(models.Task, { foreignKey: 'childId' });
models.Task.belongsTo(models.Parent, { foreignKey: 'parentId' });
models.Task.belongsTo(models.Child, { foreignKey: 'childId' });

models.Child.hasMany(models.Transaction, { foreignKey: 'childId' });
models.Transaction.belongsTo(models.Child, { foreignKey: 'childId' });
models.Task.hasMany(models.Transaction, { foreignKey: 'taskId' });
models.Transaction.belongsTo(models.Task, { foreignKey: 'taskId' });

models.Child.hasOne(models.Streak, { foreignKey: 'childId' });
models.Streak.belongsTo(models.Child, { foreignKey: 'childId' });

// Child.hasMany(Blog, { foreignKey: 'authorId', as: 'authoredBlogs' });
// Blog.belongsTo(Child, { foreignKey: 'authorId', as: 'author' });
// Parent.hasMany(Blog, { foreignKey: 'approvedById' });
// Blog.belongsTo(Parent, { foreignKey: 'approvedById', as: 'approver' });

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