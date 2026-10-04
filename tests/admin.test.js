const request = require('supertest');

const app = require('../src/app');
const prisma = require('../src/config/prisma');
const { authHeader, createBookmark, registerUser } = require('./helpers');
const { createAdminUser } = require('./setup');

describe('Admin API', () => {
  // Seeded admin + two ordinary users, rebuilt for every test (setup.js has
  // already truncated the database).
  let admin;
  let userA;
  let userB;

  beforeEach(async () => {
    admin = await createAdminUser(app, { email: 'admin@example.com' });
    userA = await registerUser(app, { email: 'usera@example.com' });
    userB = await registerUser(app, { email: 'userb@example.com' });
  });

  // ---------------------------------------------------------------------------
  // Access control
  // ---------------------------------------------------------------------------
  describe('access control', () => {
    it('returns 403 when a regular user requests admin users', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set(authHeader(userA.accessToken));

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Admin access required');
    });

    it('returns 401 when no token is provided', async () => {
      const response = await request(app).get('/api/admin/users');

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/admin/users
  // ---------------------------------------------------------------------------
  describe('GET /api/admin/users', () => {
    it('lists every user (admin + 2 regular users)', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set(authHeader(admin.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveLength(3);
      expect(response.body.pagination.total).toBe(3);
      expect(response.body.data.every((u) => u.password === undefined)).toBe(true);
    });

    it('supports ?search= on email or name', async () => {
      const response = await request(app)
        .get('/api/admin/users?search=usera')
        .set(authHeader(admin.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].email).toBe('usera@example.com');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/admin/users/:id
  // ---------------------------------------------------------------------------
  describe('GET /api/admin/users/:id', () => {
    it('returns a single user without the password', async () => {
      const response = await request(app)
        .get(`/api/admin/users/${userA.user.id}`)
        .set(authHeader(admin.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.email).toBe('usera@example.com');
      expect(response.body.data.password).toBeUndefined();
    });

    it('returns 404 for an unknown user', async () => {
      const response = await request(app)
        .get('/api/admin/users/999999')
        .set(authHeader(admin.accessToken));

      expect(response.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/admin/users/:id/role
  // ---------------------------------------------------------------------------
  describe('PATCH /api/admin/users/:id/role', () => {
    it('promotes another user to admin', async () => {
      const response = await request(app)
        .patch(`/api/admin/users/${userA.user.id}/role`)
        .set(authHeader(admin.accessToken))
        .send({ role: 'admin' });

      expect(response.status).toBe(200);
      expect(response.body.data.role).toBe('admin');

      const stored = await prisma.user.findUnique({ where: { id: userA.user.id } });
      expect(stored.role).toBe('admin');
    });

    it('returns 400 when an admin changes their own role', async () => {
      const response = await request(app)
        .patch(`/api/admin/users/${admin.user.id}/role`)
        .set(authHeader(admin.accessToken))
        .send({ role: 'user' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Cannot change your own role');
    });

    it('returns 400 for an invalid role value', async () => {
      const response = await request(app)
        .patch(`/api/admin/users/${userA.user.id}/role`)
        .set(authHeader(admin.accessToken))
        .send({ role: 'superuser' });

      expect(response.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/admin/users/:id
  // ---------------------------------------------------------------------------
  describe('DELETE /api/admin/users/:id', () => {
    it('deletes another user', async () => {
      const response = await request(app)
        .delete(`/api/admin/users/${userA.user.id}`)
        .set(authHeader(admin.accessToken));

      expect(response.status).toBe(204);

      const stored = await prisma.user.findUnique({ where: { id: userA.user.id } });
      expect(stored).toBeNull();
    });

    it('returns 400 when an admin deletes themselves', async () => {
      const response = await request(app)
        .delete(`/api/admin/users/${admin.user.id}`)
        .set(authHeader(admin.accessToken));

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Cannot delete yourself');

      const stored = await prisma.user.findUnique({ where: { id: admin.user.id } });
      expect(stored).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/admin/bookmarks
  // ---------------------------------------------------------------------------
  describe('GET /api/admin/bookmarks', () => {
    it("lists every user's bookmarks including the owner's email", async () => {
      await createBookmark(app, userA.accessToken, {
        title: 'A bookmark',
        url: 'https://a.example.com',
      });
      await createBookmark(app, userB.accessToken, {
        title: 'B bookmark',
        url: 'https://b.example.com',
      });

      const response = await request(app)
        .get('/api/admin/bookmarks')
        .set(authHeader(admin.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.map((b) => b.userEmail)).toEqual(
        expect.arrayContaining(['usera@example.com', 'userb@example.com'])
      );
    });

    it('supports ?userId= filtering', async () => {
      await createBookmark(app, userA.accessToken, { title: 'Mine' });
      await createBookmark(app, userB.accessToken, { title: 'Theirs' });

      const response = await request(app)
        .get(`/api/admin/bookmarks?userId=${userA.user.id}`)
        .set(authHeader(admin.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('Mine');
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/admin/bookmarks/:id
  // ---------------------------------------------------------------------------
  describe('DELETE /api/admin/bookmarks/:id', () => {
    it("deletes any user's bookmark", async () => {
      const { bookmark } = await createBookmark(app, userA.accessToken, {
        title: 'Doomed',
        url: 'https://doomed.example.com',
      });

      const response = await request(app)
        .delete(`/api/admin/bookmarks/${bookmark.id}`)
        .set(authHeader(admin.accessToken));

      expect(response.status).toBe(204);

      const stored = await prisma.bookmark.findUnique({ where: { id: bookmark.id } });
      expect(stored).toBeNull();
    });

    it('returns 404 for an unknown bookmark', async () => {
      const response = await request(app)
        .delete('/api/admin/bookmarks/999999')
        .set(authHeader(admin.accessToken));

      expect(response.status).toBe(404);
    });
  });
});