const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');

const prisma = require('../config/prisma');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  decodeToken,
} = require('../utils/jwt');

// Never expose the password hash in responses.
const sanitizeUser = (user) => {
  const { password, ...safeUser } = user;
  return safeUser;
};

const validationError = (res, errors) =>
  res.status(400).json({
    status: 'error',
    message: 'Validation failed',
    errors: errors.array().map(({ path, msg }) => ({ field: path, message: msg })),
  });

// ---- Token helpers ----

// Fallback TTL (7 days) used only if a token has no decodable `exp` claim.
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Derive the refresh token's expiry from its own `exp` claim so the DB row
// always matches the JWT lifetime (7 days by default).
const getRefreshTokenExpiry = (refreshToken) => {
  const decoded = decodeToken(refreshToken);

  if (decoded && typeof decoded.exp === 'number') {
    return new Date(decoded.exp * 1000);
  }

  return new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
};

// Issue an access + refresh token pair and persist the refresh token so it can
// later be verified (refresh), revoked (logout) or bulk-revoked (logout-all).
const issueAuthTokens = async (user) => {
  const payload = { id: user.id, email: user.email, role: user.role };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: getRefreshTokenExpiry(refreshToken),
    },
  });

  return { accessToken, refreshToken };
};

// Blacklist an access token so it can no longer be reused after logout.
const blacklistAccessToken = async (accessToken, exp) => {
  if (!accessToken) return;

  const expiresAt =
    typeof exp === 'number'
      ? new Date(exp * 1000)
      : new Date(Date.now() + 15 * 60 * 1000);

  // upsert avoids a unique-constraint error if the token is already listed.
  await prisma.blacklistedToken.upsert({
    where: { token: accessToken },
    update: {},
    create: { token: accessToken, expiresAt },
  });
};

// ---- POST /api/auth/register ----
const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return validationError(res, errors);
    }

    // Only whitelisted fields are read from the body: any incoming `role`
    // (e.g. "admin") is ignored so self-registration can never escalate.
    const { email, password, name } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      return res.status(409).json({
        status: 'error',
        message: 'Email is already registered',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      // `role` is always forced to "user"; the body value is never trusted.
      data: { email, password: hashedPassword, name, role: 'user' },
    });

    const { accessToken, refreshToken } = await issueAuthTokens(user);

    return res.status(201).json({
      status: 'success',
      data: { user: sanitizeUser(user), accessToken, refreshToken },
    });
  } catch (error) {
    return next(error);
  }
};

// ---- POST /api/auth/login ----
const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return validationError(res, errors);
    }

    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid credentials',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid credentials',
      });
    }

    const { accessToken, refreshToken } = await issueAuthTokens(user);

    return res.status(200).json({
      status: 'success',
      data: {
        user: sanitizeUser(user),
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    return next(error);
  }
};

// ---- GET /api/auth/me (protected) ----
const me = async (req, res, next) => {
  try {
    return res.status(200).json({
      status: 'success',
      data: { user: sanitizeUser(req.user) },
    });
  } catch (error) {
    return next(error);
  }
};

// ---- POST /api/auth/refresh ----
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        status: 'error',
        message: 'Refresh token is required',
      });
    }

    const invalidRefreshToken = () =>
      res.status(401).json({
        status: 'error',
        message: 'Invalid or expired refresh token',
      });

    // 1. Signature + expiry check against JWT_REFRESH_SECRET.
    let decoded;

    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      return invalidRefreshToken();
    }

    // 2. Must exist in the DB and not have been revoked.
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!storedToken || storedToken.revoked) {
      return invalidRefreshToken();
    }

    // 3. Must not be expired in the DB either.
    if (storedToken.expiresAt.getTime() <= Date.now()) {
      return invalidRefreshToken();
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user) {
      return invalidRefreshToken();
    }

    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return res.status(200).json({
      status: 'success',
      data: { accessToken },
    });
  } catch (error) {
    return next(error);
  }
};

// ---- POST /api/auth/logout (protected) ----
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    // Revoke the supplied refresh token (only if it belongs to this user).
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken, userId: req.user.id },
        data: { revoked: true },
      });
    }

    // Blacklist the access token currently in use.
    await blacklistAccessToken(req.accessToken, req.tokenExp);

    return res.status(200).json({
      status: 'success',
      message: 'Logged out',
    });
  } catch (error) {
    return next(error);
  }
};

// ---- POST /api/auth/logout-all (protected) ----
const logoutAll = async (req, res, next) => {
  try {
    // Revoke every still-active refresh token belonging to this user.
    await prisma.refreshToken.updateMany({
      where: { userId: req.user.id, revoked: false },
      data: { revoked: true },
    });

    // Blacklist the access token currently in use.
    await blacklistAccessToken(req.accessToken, req.tokenExp);

    return res.status(200).json({
      status: 'success',
      message: 'Logged out from all devices',
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { register, login, me, refresh, logout, logoutAll };