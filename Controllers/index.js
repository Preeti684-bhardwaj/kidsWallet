const db = require('../Configs/db/DbConfig');
const sequelize = db.sequelize;
const express = require('express');
const models = require('../Modals/index');
const {
  isValidLength,
} = require("../Validators/parentValidation");
const { authenticateToken,authenticateChildToken,authenticateUnifiedToken } = require("../Middlewares/auth");
const ErrorHandler = require("../Utils/errorHandle");
const asyncHandler = require("../Utils/asyncHandler");


class BaseController {
    constructor(model) {
        this.model = model;
        this.router = express.Router();
        this.validAttributesCache = new Set(Object.keys(this.model.rawAttributes));
        this.initializeRoutes();
      }

  initializeRoutes() {
    this.router.post('/list', this.listWithReferences.bind(this));
    this.router.get('/detail',authenticateToken, this.read.bind(this));
    // this.router.get('/:id', this.read.bind(this));
    this.router.post('/', this.create.bind(this));
    this.router.put('/detail',authenticateUnifiedToken, this.update.bind(this));
    this.router.put('/:id', this.update.bind(this));
    this.router.delete('/detail',authenticateToken, this.delete.bind(this));
    this.router.delete('/:id', this.delete.bind(this));
  }

listArgVerify(req,res,queryOptions)
	{
		throw "Method need to be implemented in child class";
	}

async afterCreate(req,res,newObject,transaction)
	{
		throw "Method need to be implemented in child class";
	}

async listWithReferences(req, res) {
    try {
        const {
	    user,
            page = 1,
            limit = 10,
            attributes,
            include,
            where
        } = req.body;

        const offset = (page - 1) * limit;

        let validAttributes = attributes ? attributes.filter(attr => this.validAttributesCache.has(attr)) : null;
        if (validAttributes && validAttributes.length === 0) {
            return res.status(400).json({ error: 'No valid attributes provided' });
        }

        let queryWhere = {};
        if (where) {
            for (let key in where) {
                if (!this.validAttributesCache.has(key)) {
                    return res.status(400).json({ error: `Invalid attribute for filtering: ${key}` });
                }
                queryWhere[key] = where[key];
            }
        }
	
	const modelAssociations = this.model.associations;
      	for (const key in modelAssociations) {
        	const association = modelAssociations[key];
		console.log(association);
	}

        let queryInclude = [];
        if (include) {
            include.forEach(inc => {
                if (this.model.associations[inc] && this.model.associations[inc].target) {
		    //console.log(this.model.associations[inc].target);
		    //console.log(this.model.associations[inc].isAliased);
		    //console.log(this.model.associations[inc].options);
                    queryInclude.push({ model: this.model.associations[inc].target,as:inc });
                } else {
                    return res.status(400).json({ error: `Invalid include parameter: ${inc}` });
                }
            });
        }

        const queryOptions = {
            attributes: validAttributes,
            where: queryWhere,
            include: queryInclude,
            limit: limit,
            offset: offset,
            order: [['id', 'ASC']]
        };
	this.listArgVerify(req,res,queryOptions);

	console.log(queryOptions);
        const results = await this.model.findAndCountAll(queryOptions);

        res.json({
            data: results.rows,
            total: results.count,
            totalPages: Math.ceil(results.count / limit),
            currentPage: page
        });
    } catch (error) {
       return res.status(500).json({ error: error.message });
    }
}


  async list(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;

      const results = await this.model.findAndCountAll({
        limit: limit,
        offset: offset,
        order: [['id', 'ASC']],
      });

      res.json({
        data: results.rows,
        total: results.count,
        totalPages: Math.ceil(results.count / limit),
        currentPage: page
      });
    } catch (error) {
    return res.status(500).json({ error: error.message });
    }
  }

  async read(req, res) {
    try {
      const id = req.parent?.id || req.params?.id;
      const item = await this.model.findByPk(id, {
        attributes: { exclude: ["password", "otp", "otpExpire"] },
      });
      console.log(item);
      
      if (!item) {
       return res.status(404).json({ error: `Resource with id ${id} not found` });
      } else {
       return res.status(200).json({success:true,data:item});
      }
    } catch (error) {
    return res.status(500).json({ error: error.message });
    }
  }


   async create(req, res) {
    const transaction = await sequelize.transaction();
    try {
      // Initialize the new item's data from request body
      const newData = req.body;

      const modelAssociations = this.model.associations;
      // Check for foreign keys and handle them appropriately
      for (const key in modelAssociations) {
        const association = modelAssociations[key];
        console.log(association);
        if (association.associationType === 'BelongsToMany') {
          const foreignKey = association.foreignKey;
          console.log(foreignKey)
          const associatedModel = association.target;
          const foreignKeyId = newData[foreignKey];
	  console.log(foreignKeyId)
          if (foreignKeyId) {
            const associatedInstance = await associatedModel.findByPk(foreignKeyId, { transaction });
            if (!associatedInstance) {
              throw new Error(`${associatedModel.name} with ID ${foreignKeyId} not found`);
            }
            // Set the instance to be used for creating the new record
           // newData[foreignKey] = foreignKeyId;
          }
        }
      }

 // Assuming foreign keys are named as ForeignKeyModelId in the request
      for (const key in modelAssociations) {
        const association = modelAssociations[key];
	console.log(association);
        if (association.associationType === 'BelongsTo') {
          const foreignKey = association.foreignKey;
	  console.log(foreignKey)
          const associatedModel = association.target;
          const foreignKeyId = newData[foreignKey];
	  console.log(foreignKeyId)
          if (foreignKeyId) {
            const associatedInstance = await associatedModel.findByPk(foreignKeyId, { transaction });
	    console.log(associatedInstance);
            if (!associatedInstance) {
              throw new Error(`${associatedModel.name} with ID ${foreignKeyId} not found`);
            }
            // Set the instance to be used for creating the new record
            newData[foreignKey] = foreignKeyId;
          }
	  else
	  {
	      throw new Error(`${associatedModel.name} with ID ${foreignKeyId} not found`);
	  }
        }
      }
     
      // Create new item with foreign key references
      const newItem = await this.model.create(newData, { transaction });


      await this.afterCreate(req,res,newItem,transaction);
      // If everything is fine, commit the transaction
      await transaction.commit();
     return res.status(201).json(newItem);
    } catch (error) {
      // If there is an error, rollback the transaction
      await transaction.rollback();
     return res.status(400).json({ error: error.message });
    }
  }

  async update(req, res,next) {
    try {
      const id = req.parent?.id;
      if (!id) {
        return next(new ErrorHandler("parentId not found in token",400));
      }
  
      const isChild = req.user?.obj?.type === 'child';
      let updateData;
  
      if (isChild) {
        return next(new ErrorHandler("Unauthorized",400));
        }
      //   // Restrict child users to updating only name, age, and isPublicAccount
      //   const allowedFields = ['name', 'age', 'isPublicAccount'];
      //   updateData = Object.keys(req.body)
      //     .filter(key => allowedFields.includes(key))
      //     .reduce((obj, key) => ({ ...obj, [key]: req.body[key] }), {});
      // } else {
      //   // Allow parent users to update any fields (or define different restrictions)
      //   updateData = { ...req.body };
      // }
  
      // Validate and sanitize fields
      if (typeof updateData.name === 'string') {
        const sanitizedName = updateData.name.trim().replace(/\s+/g, ' ');
        if (!sanitizedName) {
          return next(new ErrorHandler('Name cannot be empty or whitespace',400 ));
        }
        const nameError = isValidLength(sanitizedName);
        if (nameError) {
          return next(new ErrorHandler(nameError, 400));
        }
        updateData.name = sanitizedName;
      }
  
      if (updateData.age !== undefined) {
        const age = parseInt(updateData.age, 10);
        if (isNaN(age) || age < 5 || age > 16) {
           return next(new ErrorHandler('Age must be a number between 5 and 16' ,400));
        }
        updateData.age = age;
      }
  
      if (updateData.isPublicAccount !== undefined) {
        if (typeof updateData.isPublicAccount !== 'boolean') {
          return next(new ErrorHandler('isPublicAccount must be a boolean',400));
        }
      }
  
      // If no valid fields to update, return an error
      if (Object.keys(updateData).length === 0) {
        return next(new ErrorHandler('No valid fields provided for update' ,400));
      }
  
      const [updated] = await this.model.update(updateData, {
        where: { id }
      });
  
      if (updated) {
        const updatedItem = await this.model.findByPk(id, {
          attributes: { exclude: ['password', 'otp', 'otpExpire'] },
        });
       return res.status(200).json({ status: true, data: updatedItem });
      } else {
         return next(new ErrorHandler(`Resource with id ${id} not found` ,404));
      }
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  
async delete(req, res) {
	try {
		const id = req.parent?.id || req.params?.id;
		const deleted = await this.model.destroy({
			where: { id: id }
		});

		if (deleted) {
		return res.status(204).send({success:true,message:"delete successfully"});
		} else {
		return res.status(404).json({ error: 'Item not found' });
		}
	} catch (error) {
		return res.status(500).json({ error: error.message });
	}
}


// Added 'targetUrl' as a parameter to the function
// async function proxyRequest(req, res, targetUrl) {
// 	try {
// 		// Use the 'targetUrl' passed as a parameter for the external API
// 		const response = await axios({
// 			method: req.method,
// 			url: targetUrl,
// 			params: req.query,  // Passing query parameters
// 			data: req.body,     // Passing body data
// 			headers: {
// 				'Content-Type': 'application/json'
// 			}
// 		});

// 		// Send the response from the external API back to the original client
// 		res.status(response.status).send(response.data);
// 	} catch (error) {
// 		// Handle possible errors
// 		console.error('Error proxying request:', error.message);
// 		res.status(error.response ? error.response.status : 500).send(error.message);
// 	}
// }

}

module.exports = BaseController;