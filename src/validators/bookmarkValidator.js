const { body, validationResult } = require('express-validator');

// ---- Shared result handler: stops the chain and returns 400 on failure ----
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: errors.array().map(({ path, msg }) => ({ field: path, message: msg })),
    });
  }

  return next();
};

// ---- POST /api/bookmarks ----
const createBookmarkValidator = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isString()
    .withMessage('Title must be a string'),
  body('url')
    .trim()
    .notEmpty()
    .withMessage('URL is required')
    .isURL()
    .withMessage('A valid URL is required'),
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string'),
  body('tags')
    .optional()
    .isString()
    .withMessage('Tags must be a string'),
  validate,
];

// ---- PATCH /api/bookmarks/:id (all fields optional) ----
const updateBookmarkValidator = [
  body('title')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Title cannot be empty')
    .isString()
    .withMessage('Title must be a string'),
  body('url')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('URL cannot be empty')
    .isURL()
    .withMessage('A valid URL is required'),
  body('description')
    .optional({ nullable: true })
    .isString()
    .withMessage('Description must be a string'),
  body('tags')
    .optional({ nullable: true })
    .isString()
    .withMessage('Tags must be a string'),
  validate,
];

module.exports = {
  createBookmarkValidator,
  updateBookmarkValidator,
  validate,
};