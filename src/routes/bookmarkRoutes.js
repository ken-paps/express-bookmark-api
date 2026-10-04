const express = require('express');

const {
  createBookmarkValidator,
  updateBookmarkValidator,
} = require('../validators/bookmarkValidator');
const {
  getAllBookmarks,
  getBookmarkById,
  createBookmark,
  updateBookmark,
  deleteBookmark,
} = require('../controllers/bookmarkController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// ---- Every bookmark route requires authentication ----
router.use(protect);

// ---- /api/bookmarks ----
router
  .route('/')
  .get(getAllBookmarks)
  .post(createBookmarkValidator, createBookmark);

// ---- /api/bookmarks/:id ----
router
  .route('/:id')
  .get(getBookmarkById)
  .patch(updateBookmarkValidator, updateBookmark)
  .delete(deleteBookmark);

module.exports = router;