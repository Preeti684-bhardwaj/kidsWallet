const express = require('express');
const router = express.Router();
const parentController = require('../Controllers/parentController');


// Delegate routing to the controller
router.use('/', parentController.router);

module.exports = router;