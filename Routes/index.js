const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config();
const app = express();
const cors = require("cors");
const errorMiddleware = require("../Middlewares/error");
const asyncHandler = require("../Utils/asyncHandler");
const ErrorHandler = require("../Utils/errorHandle");

// Define the allowed origins
const allowedOrigins = [
    // "https://xplore-instant.vercel.app",
    // "https://pre.xplore.xircular.io",
    "http://localhost:5173",
    "https://market-management-tool.vercel.app"
    // "https://xplr.live"
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
const adminRouter = require("./adminRoutes");
const productRouter = require("./productRoutes");
const goalRouter = require("./goalRoutes");
const {listFiles,deleteFile}=require("../Utils/cdnImplementation")
// const blogRouter = require("./blogRoutes");


// Routes declaration
app.use("/parent", parentRouter);
app.use("/child", childRouter);
app.use("/admin", adminRouter);
app.use("/product", productRouter);
// app.use("/blog", blogRouter);
app.use("/task", taskRouter);
app.use("/goal", goalRouter);
app.get('/list_files', asyncHandler(async (req, res,next) => {
    try {
      const cdnFiles = await listFiles();
  
      return res.status(200).json({
        success: true,
        data: {
          files: cdnFiles,
        },
      });
    } catch (error) {
      console.error("Get Files Error:", error);
      return next(new ErrorHandler(`Failed to retrieve files: ${error.message}`,500));
    }
  }));
  app.delete('/delete_cdnfiles',asyncHandler(async (req, res,next) => {
    try {
      const { fileName } = req.query;
  
      // Validate fileName
      if (!fileName) {
        return next(new ErrorHandler( "File name is required in query parameters",400));
      }
  
      try {
        // Delete from CDN first
        await deleteFile(fileName);
  
        return res.status(200).json({
          success: true,
          message: "File deleted successfully from CDN",
        });
      } catch (error) {
        // If CDN deletion fails, don't update database
       return next(new ErrorHandler(`CDN deletion failed: ${error.message}`,500));
      }
    } catch (error) {
      console.error("Delete Content Error:", error);
      return next(new ErrorHandler(`Deletion failed: ${error.message}`,500));
    }
  }));


// Middleware for error
app.use(errorMiddleware);

module.exports = app;