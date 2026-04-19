// routes.js
const express = require('express');
const router = express.Router();
const containerController = require('./controllers/containerController');
const authController = require('./controllers/authController');
const adminController = require('./controllers/adminController');
const { authenticateToken, requireAdmin } = require('./middleware/auth');

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

// Admin routes
router.get('/admin/stats', authenticateToken, requireAdmin, adminController.getStats);
router.get('/admin/users', authenticateToken, requireAdmin, adminController.getAllUsers);
router.get('/admin/containers', authenticateToken, requireAdmin, adminController.getAllContainers);
router.post('/admin/toggle-admin/:id', authenticateToken, requireAdmin, adminController.toggleAdmin);

module.exports = router;
