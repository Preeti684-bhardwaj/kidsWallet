const router = require("./Routes/index.js");
const { testConnection } = require("./Configs/db/DbEnv.js");
const express = require("express");
const models = require("./Modals/index.js");
const db = models.db;
const dotenv = require("dotenv").config();
const { scheduleTaskStatusAndRecurrence } = require("./Utils/taskreccuringSchedular.js");
// const setupSocket = require("./src/Utils/socketSetup.js");
let cluster = require("express-cluster");

// Server initialization
cluster(
  async function (worker) {
    try {
      const app = express();
      // Test database connection
      const isConnected = await testConnection(db.sequelize);
      if (!isConnected) {
        throw new Error("Database connection test failed");
      }

      // Sync database
      if( process.env.NODE_ENV === "production") {
      await db.sequelize.sync({ alter: true });
      }
      app.use("/api", router);
      // Start HTTP server
      const server = app.listen(process.env.PORT || 7991, () => {
        console.log(`Server listening on port ${process.env.PORT}`);
      });
      // Start the scheduler
      scheduleTaskStatusAndRecurrence();
      // Setup WebSocket
      //   const io = setupSocket(server);
      //   app.set("io", io);

      // Graceful shutdown
      const shutdown = async () => {
        console.log("Shutting down gracefully...");

        try {
          await Promise.all([
            new Promise((resolve) => server.close(resolve)),
            db.sequelize.close(),
          ]);
          console.log("Server shutdown completed");
          process.exit(0);
        } catch (err) {
          console.error("Error during shutdown:", err);
          process.exit(1);
        }
      };

      process.on("SIGTERM", shutdown);
      process.on("SIGINT", shutdown);
    } catch (error) {
      console.error("Server startup failed:", error);
      process.exit(1);
    }
  },
  { count: 4 }
);
