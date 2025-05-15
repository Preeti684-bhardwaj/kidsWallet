const express = require('express');
const router = express.Router();
const blogController = require('../Controllers/blogController');


// Delegate routing to the controller
router.use('/', blogController.router);

module.exports = router;