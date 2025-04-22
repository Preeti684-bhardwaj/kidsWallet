const db = require('../Configs/db/DbConfig');

// Import models
const models = {
    Parent: require('./parentModal')(db.sequelize, db.Sequelize.DataTypes),
}
// Define relationships


models.db = db;
module.exports = models;