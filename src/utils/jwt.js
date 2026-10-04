require('dotenv').config();

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// A unique `jti` (JWT ID) is added to every token so that two tokens issued
// within the same second are never byte-identical. Without it, a second login
// in the same second would produce the same string and collide with the
// `RefreshToken.token` / `BlacklistedToken.token` unique constraints.
const generateAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    jwtid: crypto.randomUUID(),
  });

// ---- Refresh token (long lived, separate secret) ----
const generateRefreshToken = (payload) =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    jwtid: crypto.randomUUID(),
  });

const verifyAccessToken = (token) => jwt.verify(token, process.env.JWT_SECRET);

const verifyRefreshToken = (token) =>
  jwt.verify(token, process.env.JWT_REFRESH_SECRET);

// Decode without verifying - used to read the `exp` claim for freshness checks.
const decodeToken = (token) => jwt.decode(token);

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
};