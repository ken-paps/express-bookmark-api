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

// ---- POST /api/auth/register ----
const registerValidator = [
  body('email')
    .isEmail()
    .withMessage('A valid email address is required')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),
  body('name')
    .optional()
    .isString()
    .withMessage('Name must be a string'),
  validate,
];

// ---- POST /api/auth/login ----
const loginValidator = [
  body('email')
    .isEmail()
    .withMessage('A valid email address is required')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  validate,
];

module.exports = {
  registerValidator,
  loginValidator,
  validate,
};