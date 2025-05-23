// const BaseController = require("./index");
// const models = require("../Modals/index");
// const db = require("../Configs/db/DbConfig");
// const sequelize = db.sequelize;
// const ErrorHandler = require("../Utils/errorHandle");
// const asyncHandler = require("../Utils/asyncHandler");
// const { authenticateChildToken, authenticateToken } = require("../Middlewares/auth");

// class blogController extends BaseController {
//   constructor() {
//     // Pass the Blog model to the parent BaseController
//     super(models.Blog);

//     // Add custom routes
//     this.router.post("/create", authenticateChildToken, this.createBlog.bind(this));
//     this.router.get("/list", this.getBlogs.bind(this));
//     this.router.get("/get/:blogId", this.getBlogById.bind(this));
//     this.router.put("/approve/:blogId", authenticateToken, this.approveBlog.bind(this));
//     this.router.post("/like/:blogId", authenticateChildToken, this.likeBlog.bind(this));
//     this.router.post("/comment/:blogId", authenticateChildToken, this.commentOnBlog.bind(this));
//     // this.router.post("/follow/:authorId", authenticateChildToken, this.followAuthor.bind(this));
//     // this.router.post("/unfollow/:authorId", authenticateChildToken, this.unfollowAuthor.bind(this));
//     this.router.get("/my-blogs", authenticateChildToken, this.getMyBlogs.bind(this));
//     this.router.get("/achievements", authenticateChildToken, this.getBlogAchievements.bind(this));
//     this.router.put("/feature/:blogId", authenticateToken, this.featureBlog.bind(this));
//   }

//   // Override BaseController's listArgVerify to add filtering logic
//   listArgVerify(req, res, queryOptions) {
//     // Add filtering for published and approved blogs
//     if (!queryOptions.where) queryOptions.where = {};
//     queryOptions.where.isPublished = true;
//     queryOptions.where.isApproved = true;
//   }

//   // Override BaseController's afterCreate for post-creation actions
//   async afterCreate(req, res, newObject, transaction) {
//     // Notification is already created in createBlog method
//   }

//   /**
//    * Get blogs with filtering and pagination
//    * GET /api/blogs/list
//    */
//   getBlogs = asyncHandler(async (req, res, next) => {
//     try {
//       const { ageGroup, category, page = 1, limit = 10, featured, sort = 'latest' } = req.query;

//       // Build query
//       const query = { isPublished: true, isApproved: true };

//       if (ageGroup && ageGroup !== "all") {
//         query.ageGroup = ageGroup;
//       }

//       if (category) {
//         query.category = category;
//       }

//       if (featured === 'true') {
//         query.isFeatured = true;
//       }

//       // Calculate pagination
//       const offset = (page - 1) * limit;

//       // Determine sorting
//       let orderBy = [["createdAt", "DESC"]];
//       if (sort === 'popular') {
//         orderBy = [["readCount", "DESC"], ["likeCount", "DESC"]];
//       } else if (sort === 'engagement') {
//         orderBy = [["likeCount", "DESC"], ["commentCount", "DESC"]];
//       }

//       // Get blogs
//       const blogs = await models.Blog.findAndCountAll({
//         where: query,
//         limit: parseInt(limit),
//         offset: parseInt(offset),
//         order: orderBy,
//         include: [
//           {
//             model: models.Child,
//             as: "author",
//             attributes: ["id", "name", "age"],
//           },
//           // Uncomment when Quiz model is ready
//           // {
//           //   model: models.Quiz,
//           //   attributes: ["id", "title", "coinReward"],
//           // },
//         ],
//       });

//       return res.status(200).json({
//         success: true,
//         data: blogs.rows,
//         pagination: {
//           total: blogs.count,
//           page: parseInt(page),
//           limit: parseInt(limit),
//           pages: Math.ceil(blogs.count / limit),
//         },
//       });
//     } catch (error) {
//       console.error("Error fetching blogs:", error);
//       return res
//         .status(500)
//         .json({ success: false, message: "Failed to fetch blogs", error: error.message });
//     }
//   });

//   /**
//    * Get single blog by ID
//    * GET /api/blogs/get/:blogId
//    */
//   getBlogById = asyncHandler(async (req, res, next) => {
//     try {
//       const { blogId } = req.params;
//       const childId = req.body.childId || req.query.childId; // Support both query and body

//       // Get blog
//       const blog = await models.Blog.findOne({
//         where: { id: blogId, isPublished: true, isApproved: true },
//         include: [
//           {
//             model: models.Child,
//             as: "author",
//             attributes: ["id", "name", "age"],
//           },
//           // Uncomment when Quiz model is ready
//           // {
//           //   model: models.Quiz,
//           //   include: [
//           //     {
//           //       model: models.QuizQuestion,
//           //       attributes: ["id", "question", "options"],
//           //     },
//           //   ],
//           // },
//         ],
//       });

//       if (!blog) {
//         return res.status(404).json({ success: false, message: "Blog not found" });
//       }

//       // Increment read count
//       await blog.update({ readCount: blog.readCount + 1 });

//       // Record read engagement if childId provided
//       if (childId) {
//         await models.BlogEngagement.create({
//           blogId,
//           childId,
//           type: "read",
//         });

//         // Check for read milestones
//         await this.checkBlogReadMilestones(blog);
//       }

//       return res.status(200).json({ success: true, data: blog });
//     } catch (error) {
//       console.error("Error fetching blog:", error);
//       return res
//         .status(500)
//         .json({ success: false, message: "Failed to fetch blog", error: error.message });
//     }
//   });

//   /**
//    * Create blog
//    * POST /api/blogs/create
//    */
//   createBlog = asyncHandler(async (req, res, next) => {
//     try {
//       const childId = req.child.id;
//       const { title, content, category, hasVideo, videoUrl } = req.body;

//       // Validate required fields
//       if (!title || !content || !category) {
//           return next(
//           new ErrorHandler("Title, content, and category are required",400));
//     }

//       // Find child
//       const child = await models.Child.findByPk(childId);
//       if (!child) {
//         return next(
//           new ErrorHandler("Child not found" ,404));
//       }

//       // Check if child has blog access
//       if (!child.hasBlogAccess) {
//         return next(
//             new ErrorHandler( "Blog writing access not enabled for this child" ,403));
//       }

//       // Check age requirement for blog writing
//       if (child.age < 8) {
//         return next(
//             new ErrorHandler( "Blog writing is available for children 8 years and older" ,403));
//       }

//       // Determine age group based on child's age
//       let ageGroup = "all";
//       if (child.age >= 5 && child.age <= 7) {
//         ageGroup = "5-7";
//       } else if (child.age >= 8 && child.age <= 10) {
//         ageGroup = "8-10";
//       } else if (child.age >= 11 && child.age <= 13) {
//         ageGroup = "11-13";
//       } else if (child.age >= 14 && child.age <= 16) {
//         ageGroup = "14-16";
//       }

//       // Create blog
//       const newBlog = await models.Blog.create({
//         title,
//         content,
//         authorId: childId,
//         category,
//         ageGroup,
//         hasVideo: hasVideo || false,
//         videoUrl: videoUrl || null,
//         isPublished: true,
//         isApproved: false, // Requires parent approval
//       });

//       // Notify parent about blog approval
//       await models.Notification.create({
//         type: "blog_approval",
//         message: `${child.name} has written a new blog titled "${title}" that needs approval`,
//         recipientType: "parent",
//         recipientId: child.parentId,
//         relatedItemType: "blog",
//         relatedItemId: newBlog.id,
//       });

//       return res.status(201).json({
//         success: true,
//         message: "Blog created and waiting for approval",
//         data: newBlog,
//       });
//     } catch (error) {
//       console.error("Error creating blog:", error);
//       return next(
//         new ErrorHandler(error.message || "Failed to create blog", 500)
//       ); 
//     }
//   });

//   /**
//    * Approve blog
//    * PUT /api/blogs/approve/:blogId
//    */
//   approveBlog = asyncHandler(async (req, res, next) => {
//     try {
//       const { blogId } = req.params;
//       const parentId = req.parent.id;
//       const { isFeatured } = req.body;

//       // Find blog
//       const blog = await models.Blog.findOne({
//         where: { id: blogId, isApproved: false },
//         include: [
//           {
//             model: models.Child,
//             as: "author",
//             where: { parentId },
//             attributes: ["id", "name", "coinBalance", "parentId"],
//           },
//         ],
//       });

//       if (!blog) {
//         return res
//           .status(404)
//           .json({ success: false, message: "Blog not found or not written by your child" });
//       }

//       // Start transaction
//       const t = await sequelize.transaction();

//       try {
//         // Update blog status
//         await blog.update(
//           {
//             isApproved: true,
//             approvedById: parentId,
//             isFeatured: isFeatured || false,
//           },
//           { transaction: t }
//         );

//         const child = blog.author;

//         // Check if this is child's first blog
//         const blogCount = await models.Blog.count({
//           where: { authorId: child.id, isApproved: true },
//           transaction: t,
//         });

//         if (blogCount === 1) {
//           // Award coins for first blog
//           const coinReward = 50;

//           await child.update(
//             {
//               coinBalance: child.coinBalance + coinReward,
//             },
//             { transaction: t }
//           );

//           // Record transaction
//           await models.Transaction.create(
//             {
//               amount: coinReward,
//               type: "blog_reward",
//               description: `Reward for publishing first blog post`,
//               childId: child.id,
//               blogId: blog.id,
//             },
//             { transaction: t }
//           );

//           // Create achievement
//           await models.Achievement.create(
//             {
//               childId: child.id,
//               type: "first_blog",
//               milestone: "First blog published",
//               badgeAwarded: true,
//               coinReward,
//             },
//             { transaction: t }
//           );
//         }

//         // Notify child
//         await models.Notification.create(
//           {
//             type: "blog_approval",
//             message: `Your blog "${blog.title}" has been approved${
//               isFeatured ? " and featured!" : "!"
//             }`,
//             recipientType: "child",
//             recipientId: child.id,
//             relatedItemType: "blog",
//             relatedItemId: blog.id,
//           },
//           { transaction: t }
//         );

//         // Commit transaction
//         await t.commit();

//         return res.status(200).json({
//           success: true,
//           message: "Blog approved",
//           data: blog,
//         });
//       } catch (error) {
//         // Rollback transaction
//         await t.rollback();
//         throw error;
//       }
//     } catch (error) {
//       console.error("Error approving blog:", error);
//       return res
//         .status(500)
//         .json({ success: false, message: "Failed to approve blog", error: error.message });
//     }
//   });

//   /**
//    * Like a blog
//    * POST /api/blogs/like/:blogId
//    */
//   likeBlog = asyncHandler(async (req, res, next) => {
//     try {
//       const { blogId } = req.params;
//       const childId = req.child.id;

//       // Check if blog exists
//       const blog = await models.Blog.findByPk(blogId);
//       if (!blog) {
//         return res.status(404).json({ success: false, message: "Blog not found" });
//       }

//       // Check if child already liked this blog
//       const existingLike = await models.BlogEngagement.findOne({
//         where: { blogId, childId, type: "like" },
//       });

//       if (existingLike) {
//         return res.status(400).json({ success: false, message: "Blog already liked" });
//       }

//       // Create like engagement
//       await models.BlogEngagement.create({
//         blogId,
//         childId,
//         type: "like",
//       });

//       // Update blog like count
//       await blog.update({ likeCount: blog.likeCount + 1 });

//       // Award coins to blog author
//       const author = await models.Child.findByPk(blog.authorId);
//       if (author) {
//         const coinReward = 5; // 5 coins per like
//         await author.update({ coinBalance: author.coinBalance + coinReward });
        
//         await models.Transaction.create({
//           amount: coinReward,
//           type: "blog_like",
//           description: `Received like on blog "${blog.title}"`,
//           childId: blog.authorId,
//           blogId: blog.id,
//         });
//       }

//       return res.status(200).json({
//         success: true,
//         message: "Blog liked successfully",
//         data: { likeCount: blog.likeCount + 1 },
//       });
//     } catch (error) {
//       console.error("Error liking blog:", error);
//       return res
//         .status(500)
//         .json({ success: false, message: "Failed to like blog", error: error.message });
//     }
//   });

//   /**
//    * Comment on a blog
//    * POST /api/blogs/comment/:blogId
//    */
//   commentOnBlog = asyncHandler(async (req, res, next) => {
//     try {
//       const { blogId } = req.params;
//       const childId = req.child.id;
//       const { comment } = req.body;

//       if (!comment || comment.trim().length === 0) {
//         return res.status(400).json({ success: false, message: "Comment cannot be empty" });
//       }

//       // Check if blog exists
//       const blog = await models.Blog.findByPk(blogId);
//       if (!blog) {
//         return res.status(404).json({ success: false, message: "Blog not found" });
//       }

//       // Create comment engagement
//       await models.BlogEngagement.create({
//         blogId,
//         childId,
//         type: "comment",
//         comment: comment.trim(),
//       });

//       // Update blog comment count
//       await blog.update({ commentCount: blog.commentCount + 1 });

//       // Award coins to blog author
//       const author = await models.Child.findByPk(blog.authorId);
//       if (author && author.id !== childId) { // Don't award coins for commenting on own blog
//         const coinReward = 10; // 10 coins per comment
//         await author.update({ coinBalance: author.coinBalance + coinReward });
        
//         await models.Transaction.create({
//           amount: coinReward,
//           type: "blog_comment",
//           description: `Received comment on blog "${blog.title}"`,
//           childId: blog.authorId,
//           blogId: blog.id,
//         });
//       }

//       return res.status(200).json({
//         success: true,
//         message: "Comment added successfully",
//         data: { commentCount: blog.commentCount + 1 },
//       });
//     } catch (error) {
//       console.error("Error commenting on blog:", error);
//       return res
//         .status(500)
//         .json({ success: false, message: "Failed to comment on blog", error: error.message });
//     }
//   });

//   /**
//    * Get my blogs (authored by the authenticated child)
//    * GET /api/blogs/my-blogs
//    */
//   getMyBlogs = asyncHandler(async (req, res, next) => {
//     try {
//       const childId = req.child.id;
//       const { page = 1, limit = 10 } = req.query;
//       const offset = (page - 1) * limit;

//       const blogs = await models.Blog.findAndCountAll({
//         where: { authorId: childId },
//         limit: parseInt(limit),
//         offset: parseInt(offset),
//         order: [["createdAt", "DESC"]],
//         include: [
//           {
//             model: models.Child,
//             as: "author",
//             attributes: ["id", "name", "age"],
//           },
//         ],
//       });

//       return res.status(200).json({
//         success: true,
//         data: blogs.rows,
//         pagination: {
//           total: blogs.count,
//           page: parseInt(page),
//           limit: parseInt(limit),
//           pages: Math.ceil(blogs.count / limit),
//         },
//       });
//     } catch (error) {
//       console.error("Error fetching my blogs:", error);
//       return res
//         .status(500)
//         .json({ success: false, message: "Failed to fetch your blogs", error: error.message });
//     }
//   });

//   /**
//    * Get blog achievements for a child
//    * GET /api/blogs/achievements
//    */
//   getBlogAchievements = asyncHandler(async (req, res, next) => {
//     try {
//       const childId = req.child.id;

//       const achievements = await models.Achievement.findAll({
//         where: { childId },
//         order: [["createdAt", "DESC"]],
//       });

//       return res.status(200).json({
//         success: true,
//         data: achievements,
//       });
//     } catch (error) {
//       console.error("Error fetching achievements:", error);
//       return res
//         .status(500)
//         .json({ success: false, message: "Failed to fetch achievements", error: error.message });
//     }
//   });

//   /**
//    * Feature/unfeature a blog
//    * PUT /api/blogs/feature/:blogId
//    */
//   featureBlog = asyncHandler(async (req, res, next) => {
//     try {
//       const { blogId } = req.params;
//       const { isFeatured } = req.body;
      
//       // Only parents can feature blogs
//       if (!req.parent || !req.parent.id) {
//         return res.status(403).json({ success: false, message: "Only parents can feature blogs" });
//       }

//       const blog = await models.Blog.findOne({
//         where: { id: blogId, isApproved: true },
//       });

//       if (!blog) {
//         return res.status(404).json({ success: false, message: "Blog not found or not approved" });
//       }

//       await blog.update({ isFeatured: Boolean(isFeatured) });

//       return res.status(200).json({
//         success: true,
//         message: `Blog ${isFeatured ? 'featured' : 'unfeatured'} successfully`,
//         data: blog,
//       });
//     } catch (error) {
//       console.error("Error featuring blog:", error);
//       return res
//         .status(500)
//         .json({ success: false, message: "Failed to feature blog", error: error.message });
//     }
//   });

//   /**
//    * Check for blog read milestones and award achievements
//    */
//   async checkBlogReadMilestones(blog) {
//     try {
//       // Check for 100+ reads milestone
//       if (blog.readCount >= 100) {
//         const existingAchievement = await models.Achievement.findOne({
//           where: { 
//             childId: blog.authorId, 
//             type: "read_milestone",
//             milestone: "100 reads"
//           },
//         });

//         if (!existingAchievement) {
//           const coinReward = 100;
//           const child = await models.Child.findByPk(blog.authorId);
          
//           await child.update({ coinBalance: child.coinBalance + coinReward });
          
//           await models.Transaction.create({
//             amount: coinReward,
//             type: "blog_milestone",
//             description: `Blog "${blog.title}" reached 100 reads`,
//             childId: blog.authorId,
//             blogId: blog.id,
//           });

//           await models.Achievement.create({
//             childId: blog.authorId,
//             type: "read_milestone",
//             milestone: "100 reads",
//             badgeAwarded: true,
//             coinReward,
//           });
//         }
//       }

//       // Check for 1000+ reads milestone
//       if (blog.readCount >= 1000) {
//         const existingAchievement = await models.Achievement.findOne({
//           where: { 
//             childId: blog.authorId, 
//             type: "read_milestone",
//             milestone: "1000 reads"
//           },
//         });

//         if (!existingAchievement) {
//           const coinReward = 200;
//           const child = await models.Child.findByPk(blog.authorId);
          
//           await child.update({ coinBalance: child.coinBalance + coinReward });
          
//           await models.Transaction.create({
//             amount: coinReward,
//             type: "blog_milestone",
//             description: `Blog "${blog.title}" reached 1000 reads`,
//             childId: blog.authorId,
//             blogId: blog.id,
//           });

//           await models.Achievement.create({
//             childId: blog.authorId,
//             type: "read_milestone",
//             milestone: "1000 reads",
//             badgeAwarded: true,
//             coinReward,
//           });
//         }
//       }
//     } catch (error) {
//       console.error("Error checking read milestones:", error);
//     }
//   }
// }

// module.exports = new blogController();