const prisma = require('../config/prisma');
const { verifyAccessToken } = require('../utils/jwt');

// ---- protect: requires a valid `Authorization: Bearer <token>` header ----
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Not authorized, no token provided',
      });
    }

    const token = authHeader.slice('Bearer '.length).trim();

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Not authorized, no token provided',
      });
    }

    let decoded;

    try {
      decoded = verifyAccessToken(token);
    } catch (error) {
      return res.status(401).json({
        status: 'error',
        message: 'Not authorized, token is invalid or expired',
      });
    }

    // Reject tokens that have been blacklisted (e.g. after logout / logout-all).
    const blacklisted = await prisma.blacklistedToken.findUnique({
      where: { token },
    });

    if (blacklisted) {
      return res.status(401).json({
        status: 'error',
        error: 'Token has been revoked',
        message: 'Token has been revoked',
      });
    }

    // Attach the fresh user record from the database (never trust the payload alone).
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Not authorized, user no longer exists',
      });
    }

    // Expose the raw token + its expiry so controllers (logout) can blacklist it.
    req.user = user;
    req.accessToken = token;
    req.tokenExp = decoded.exp;

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = { protect };