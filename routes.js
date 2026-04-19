// routes.js
const express = require('express');
const router = express.Router();
const containerController = require('./controllers/containerController');
const authController = require('./controllers/authController');
const { authenticateToken } = require('./middleware/auth');

// Auth routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', authenticateToken, authController.getMe);

// Container routes
router.post('/create-container', authenticateToken, containerController.createContainer);
router.get('/my-containers', authenticateToken, containerController.getMyContainers);
router.delete('/delete-container/:id', authenticateToken, containerController.deleteContainer);
router.post('/stop-container/:id', authenticateToken, containerController.stopContainer);
router.post('/start-container/:id', authenticateToken, containerController.startContainer);
router.post('/dismiss-password/:id', authenticateToken, containerController.dismissPassword);

module.exports = router;
