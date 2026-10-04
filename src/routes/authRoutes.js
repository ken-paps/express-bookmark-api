const express = require('express');
const rateLimit = require('express-rate-limit');

const { registerValidator, loginValidator } = require('../validators/authValidator');
const {
  register,
  login,
  me,
  refresh,
  logout,
  logoutAll,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// ---- Brute-force protection: 10 requests / 15 min / IP, per endpoint ----
const createAuthLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    // The integration suite legitimately fires many auth requests from a single
    // IP (127.0.0.1), so throttling is bypassed in the test environment only.
    // Production/development behaviour is unchanged.
    skip: () => process.env.NODE_ENV === 'test',
    message: {
      status: 'error',
      message: 'Too many attempts, please try again after 15 minutes',
    },
  });

const registerLimiter = createAuthLimiter();
const loginLimiter = createAuthLimiter();

// ---- POST /api/auth/register ----
router.post('/register', registerLimiter, registerValidator, register);

// ---- POST /api/auth/login ----
router.post('/login', loginLimiter, loginValidator, login);

// ---- GET /api/auth/me ----
router.get('/me', protect, me);

// ---- POST /api/auth/refresh ----
router.post('/refresh', refresh);

// ---- POST /api/auth/logout ----  (access token must be valid to log out)
router.post('/logout', protect, logout);

// ---- POST /api/auth/logout-all ----
router.post('/logout-all', protect, logoutAll);

module.exports = router;