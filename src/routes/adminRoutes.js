const express = require('express');

const {
  getAllUsers,
  getUserById,
  updateUserRole,
  deleteUser,
  getAllBookmarks,
  deleteAnyBookmark,
} = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/roleMiddleware');

const router = express.Router();

// ---- Every admin route requires a valid token AND the admin role ----
router.use(protect, requireAdmin);

// ---- /api/admin/users ----
router.get('/users', getAllUsers);
router.get('/users/:id', getUserById);
router.patch('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUser);

// ---- /api/admin/bookmarks ----
router.get('/bookmarks', getAllBookmarks);
router.delete('/bookmarks/:id', deleteAnyBookmark);

module.exports = router;