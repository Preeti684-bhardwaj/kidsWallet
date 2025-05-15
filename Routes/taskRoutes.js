const express = require('express');
const router = express.Router();
const taskController = require('../Controllers/taskController');


// Delegate routing to the controller
router.use('/', taskController.router);

module.exports = router;