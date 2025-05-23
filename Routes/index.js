const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config();
const app = express();
const cors = require("cors");
const errorMiddleware = require("../Middlewares/error");

// Define the allowed origins
const allowedOrigins = [
    "https://xplore-instant.vercel.app",
    "https://pre.xplore.xircular.io",
    "http://localhost:5173",
    "https://xplr.live"
];
// Configure CORS middleware
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin, like mobile apps or curl requests
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
}));

// Serve static files from the 'public' directory
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes Imports
const parentRouter = require("./parentRoutes");
const childRouter = require("./childRoutes");
const taskRouter = require("./taskRoutes");
// const blogRouter = require("./blogRoutes");


// Routes declaration
app.use("/parent", parentRouter);
app.use("/child", childRouter);
// app.use("/blog", blogRouter);
app.use("/task", taskRouter);

// Middleware for error
app.use(errorMiddleware);

module.exports = app;