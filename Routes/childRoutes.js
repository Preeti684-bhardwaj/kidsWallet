const express = require('express');
const router = express.Router();
const childController = require('../Controllers/childController');


// Delegate routing to the controller
router.use('/', childController.router);

module.exports = router;