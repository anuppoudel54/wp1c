// routes.js
const express = require('express');
const router = express.Router();
const containerController = require('./controllers/containerController');

router.post('/create-container', containerController.createContainer);

module.exports = router;
