const {env}=require('../db/DbEnv')
const pg = require("pg");
const Sequelize = require("sequelize");

// Create Sequelize instance with error handling
let sequelize;
try {
  sequelize = new Sequelize(env.database, env.username, env.password, {
    host: env.host,
    dialect: env.dialect,
    dialectModule: pg,
    pool: {
      max: env.pool.max,
      min: env.pool.min,
      acquire: env.pool.acquire,
      idle: env.pool.idle,
    },
    dialectOptions: env.dialectOptions,
    logging: console.log,
  });
} catch (error) {
  console.error('Error creating Sequelize instance:', error);
  process.exit(1);
}

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

module.exports = db;