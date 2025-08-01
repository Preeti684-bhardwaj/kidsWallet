const { validate: isValidUUID } = require("uuid");
const models = require("../Modals/index");
const { Op } = require("sequelize")
const ErrorHandler = require("../Utils/errorHandle");

const buildAuthConditions = async (req, childId = null) => {
    if (req.parent || req.admin) {
      if (childId) {
        if (!isValidUUID(childId)) {
          throw new ErrorHandler("Invalid childId. Must be a valid UUID", 400);
        }
        console.log("Parent authenticated, checking child access for childId:", childId);
        
        // console.log("Parent ID:", req.parent?.id);
        
        // Verify parent has access to this child
        const child = await models.Child.findOne({
          where: { id: childId, parentId: req.parent?.id },
        });
        console.log("Child found:", child);
        
        if (!child) {
          throw new ErrorHandler("Child not found or not authorized", 403);
        }
        return { childId };
      }else if (req.admin) {
        // Admin can access all children
        console.log("Admin authenticated, retrieving all children");
        return { childId: { [Op.ne]: null } }; // Return all children
      }
       else {
        // Get all children of the parent
        const children = await models.Child.findAll({
          where: { parentId: req.parent?.id },
          attributes: ["id"],
        });
        console.log("Parent authenticated, retrieving all children for parent:", req.parent.id);
        
        const childIds = children.map((child) => child.id);
        return { childId: { [Op.in]: childIds.length > 0 ? childIds : [null] } };
      }
    } else if (req.child) {
      if (childId && childId !== req.child.id) {
        throw new ErrorHandler("Unauthorized to view goals for other children", 403);
      }
      return { childId: req.child?.id };
    }
    throw new ErrorHandler("Invalid user type", 400);
  };
  // Helper function to format goal data
  const formatGoalData = (goal, includeDetails = false) => {
    const goalData = goal.toJSON();
    
    const baseData = {
      id: goalData.id,
      title: goalData.title,
      description: goalData.description,
      image: goalData.image,
      type: goalData.type,
      status: goalData.status,
      childId: goalData.childId,
      childName: goalData.child?.name,
      // productsCount: goalData.products?.length || 0,
      tasksCount: goalData.tasks?.length || 0,
      completedAt: goalData.completedAt,
      approvedAt: goalData.approvedAt,
      rejectedAt: goalData.rejectedAt,
      rejectionReason: goalData.rejectionReason,
      createdAt: goalData.createdAt,
      updatedAt: goalData.updatedAt,
      // Include the calculated stats
      usagePercentage: goalData.usagePercentage || 0,
      completionRate: goalData.completionRate || 0,
    };
  
    if (includeDetails) {
      return {
        ...baseData,
        // products: formatProducts(goalData.products),
        tasks: goalData.tasks?.map(task => ({
          id: task.id,
          title: task.title,
          description: task.description,
          dueDate: task.dueDate,
          status: task.status,
          taskTemplate: task.TaskTemplate ? {
            id: task.TaskTemplate.id,
            title: task.TaskTemplate.title
          } : null
        })) || []
      };
    }
  
    return {
      ...baseData,
      // products: formatProducts(goalData.products),
      tasks: goalData.tasks || []
    };
  };

module.exports = {
  buildAuthConditions,
  formatGoalData
};


 // Helper function to format product data
  // const formatProducts = (products) => {
  //   return products?.map((product) => {
  //     const variants = product.variants || [];
  //     const prices = variants.map(v => parseFloat(v.price)).filter(p => !isNaN(p));
      
  //     return {
  //       id: product.id,
  //       name: product.name,
  //       description: product.description || null,
  //       images: product.images || null,
  //       type: product.type || null,
  //       price: prices.length > 0 ? Math.min(...prices) : null,
  //       priceRange: prices.length > 1 ? {
  //         min: Math.min(...prices),
  //         max: Math.max(...prices)
  //       } : null,
  //       variants: variants.map(v => ({
  //         id: v.id,
  //         price: parseFloat(v.price),
  //         compare_at_price: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
  //         attributes: v.attributes,
  //         is_active: v.is_active
  //       }))
  //     };
  //   }) || [];
  // };