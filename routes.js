// routes.js
const express = require('express');
const router = express.Router();
const containerController = require('./controllers/containerController');
const authController = require('./controllers/authController');

router.post('/login', authController.login);

router.post('/register', authController.register);

router.post('/create-container', containerController.createContainer);

module.exports = router;
