const request = require('supertest');

const app = require('../src/app');
const prisma = require('../src/config/prisma');
const { authHeader, loginUser, registerUser } = require('./helpers');

// A syntactically invalid JWT (three parts, but not a real token).
const MALFORMED_TOKEN = 'this.is.not-a-valid-token';

describe('Auth API', () => {
  // ---------------------------------------------------------------------------
  // POST /api/auth/register
  // ---------------------------------------------------------------------------
  describe('POST /api/auth/register', () => {
    it('returns 201 with the user and an access token, and never leaks the password', async () => {
      const { response, payload } = await registerUser(app);

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');

      // The returned user is the persisted one, minus the password hash.
      expect(response.body.data.user).toMatchObject({
        email: payload.email,
        name: payload.name,
        role: 'user',
      });
      expect(response.body.data.user.id).toEqual(expect.any(Number));
      expect(response.body.data.user.password).toBeUndefined();

      // Tokens are issued right away on registration.
      expect(typeof response.body.data.accessToken).toBe('string');
      expect(typeof response.body.data.refreshToken).toBe('string');
    });

    it('returns 400 for an invalid email address', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'Password123' });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Validation failed');
    });

    it('returns 400 when the password is shorter than 8 characters', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'short@example.com', password: 'short' });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'password' })])
      );
    });

    it('returns 409 when the email is already registered', async () => {
      const { payload } = await registerUser(app, { email: 'duplicate@example.com' });

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: payload.email, password: payload.password });

      expect(response.status).toBe(409);
      expect(response.body.status).toBe('error');
    });

    it('ignores a user-supplied role and always creates a regular user', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'sneaky@example.com',
          password: 'Password123',
          role: 'admin',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.user.role).toBe('user');

      // The escalation attempt must not have reached the database either.
      const stored = await prisma.user.findUnique({ where: { email: 'sneaky@example.com' } });
      expect(stored.role).toBe('user');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/login
  // ---------------------------------------------------------------------------
  describe('POST /api/auth/login', () => {
    it('returns 200 with both an access token and a refresh token', async () => {
      const { payload } = await registerUser(app, { email: 'login@example.com' });

      const { response } = await loginUser(app, payload.email, payload.password);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.user.password).toBeUndefined();
      expect(typeof response.body.data.accessToken).toBe('string');
      expect(typeof response.body.data.refreshToken).toBe('string');
    });

    it('returns 401 when the password is wrong', async () => {
      const { payload } = await registerUser(app, { email: 'wrongpass@example.com' });

      const { response } = await loginUser(app, payload.email, 'WrongPassword123');

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
    });

    it('returns 401 for a non-existent email', async () => {
      const { response } = await loginUser(app, 'nobody@example.com', 'Password123');

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/auth/me
  // ---------------------------------------------------------------------------
  describe('GET /api/auth/me', () => {
    it('returns the current user when a valid token is provided', async () => {
      const { accessToken, user } = await registerUser(app, { email: 'me@example.com' });

      const response = await request(app)
        .get('/api/auth/me')
        .set(authHeader(accessToken));

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.user.id).toBe(user.id);
      expect(response.body.data.user.email).toBe(user.email);
      expect(response.body.data.user.password).toBeUndefined();
    });

    it('returns 401 without a token', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
    });

    it('returns 401 with a malformed token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set(authHeader(MALFORMED_TOKEN));

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/refresh
  // ---------------------------------------------------------------------------
  describe('POST /api/auth/refresh', () => {
    it('returns a new access token for a valid refresh token', async () => {
      const { refreshToken } = await registerUser(app, { email: 'refresh@example.com' });

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(typeof response.body.data.accessToken).toBe('string');

      // The freshly minted access token must actually work.
      const meResponse = await request(app)
        .get('/api/auth/me')
        .set(authHeader(response.body.data.accessToken));
      expect(meResponse.status).toBe(200);
    });

    it('returns 401 for a revoked refresh token', async () => {
      const { accessToken, refreshToken } = await registerUser(app, {
        email: 'revoked@example.com',
      });

      // Logging out revokes the refresh token associated with the session.
      await request(app)
        .post('/api/auth/logout')
        .set(authHeader(accessToken))
        .send({ refreshToken })
        .expect(200);

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/logout
  // ---------------------------------------------------------------------------
  describe('POST /api/auth/logout', () => {
    it('returns 200 and blacklists the access token', async () => {
      const { accessToken, refreshToken } = await registerUser(app, {
        email: 'logout@example.com',
      });

      const response = await request(app)
        .post('/api/auth/logout')
        .set(authHeader(accessToken))
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('rejects a blacklisted access token on subsequent requests', async () => {
      const { accessToken, refreshToken } = await registerUser(app, {
        email: 'afterlogout@example.com',
      });

      await request(app)
        .post('/api/auth/logout')
        .set(authHeader(accessToken))
        .send({ refreshToken })
        .expect(200);

      const response = await request(app)
        .get('/api/auth/me')
        .set(authHeader(accessToken));

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
    });
  });
});