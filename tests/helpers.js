/**
 * Shared test helpers.
 *
 * These wrap the most common Supertest calls so individual specs stay focused
 * on behaviour instead of on payload plumbing. Every helper returns the raw
 * Supertest response (for status/body assertions) plus the useful parsed
 * values (user, tokens, bookmark) for reuse in follow-up requests.
 */

const request = require('supertest');

const defaultUser = {
  email: 'user@example.com',
  password: 'Password123',
  name: 'Test User',
};

const defaultBookmark = {
  title: 'Default Bookmark',
  url: 'https://example.com',
  description: 'A default bookmark',
  tags: 'default',
};

// Convenience builder for the Authorization header.
const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

/**
 * Register a user and return the created user + issued tokens.
 * Pass `overrides` to change the default email/password/name.
 */
const registerUser = async (app, overrides = {}) => {
  const payload = { ...defaultUser, ...overrides };

  const response = await request(app).post('/api/auth/register').send(payload);
  const data = response.body.data || {};

  return {
    response,
    payload,
    user: data.user,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  };
};

/**
 * Log in with an existing account and return the user + tokens.
 */
const loginUser = async (app, email, password = defaultUser.password) => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  const data = response.body.data || {};

  return {
    response,
    user: data.user,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  };
};

/**
 * Create a bookmark for the given access token.
 * Pass `overrides` to change any of the default fields.
 */
const createBookmark = async (app, token, overrides = {}) => {
  const payload = { ...defaultBookmark, ...overrides };

  let req = request(app).post('/api/bookmarks');
  if (token) {
    req = req.set(authHeader(token));
  }

  const response = await req.send(payload);

  return {
    response,
    payload,
    bookmark: response.body.data,
  };
};

module.exports = {
  authHeader,
  createBookmark,
  defaultBookmark,
  defaultUser,
  loginUser,
  registerUser,
};