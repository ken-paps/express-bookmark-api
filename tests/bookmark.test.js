const request = require('supertest');

const app = require('../src/app');
const prisma = require('../src/config/prisma');
const { authHeader, createBookmark, registerUser } = require('./helpers');

describe('Bookmark API', () => {
  // A fresh owner for every test; setup.js has already emptied the database.
  let user;
  let token;

  beforeEach(async () => {
    const registered = await registerUser(app, { email: 'owner@example.com' });
    user = registered.user;
    token = registered.accessToken;
  });

  // A second, unrelated account used for ownership/isolation checks.
  const registerOtherUser = () =>
    registerUser(app, { email: 'other@example.com' });

  // ---------------------------------------------------------------------------
  // POST /api/bookmarks
  // ---------------------------------------------------------------------------
  describe('POST /api/bookmarks', () => {
    it('creates a bookmark owned by the current user', async () => {
      const { response, payload } = await createBookmark(app, token);

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toMatchObject({
        title: payload.title,
        url: payload.url,
        description: payload.description,
        tags: payload.tags,
        userId: user.id,
      });
      expect(response.body.data.id).toEqual(expect.any(Number));
    });

    it('returns 400 when the title is missing', async () => {
      const response = await request(app)
        .post('/api/bookmarks')
        .set(authHeader(token))
        .send({ url: 'https://example.com' });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'title' })])
      );
    });

    it('returns 400 when the URL is invalid', async () => {
      const { response } = await createBookmark(app, token, { url: 'not-a-url' });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'url' })])
      );
    });

    it('returns 401 without a token', async () => {
      const response = await request(app)
        .post('/api/bookmarks')
        .send({ title: 'No token', url: 'https://example.com' });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/bookmarks
  // ---------------------------------------------------------------------------
  describe('GET /api/bookmarks', () => {
    it("returns only the current user's bookmarks", async () => {
      await createBookmark(app, token, { title: 'Mine 1' });
      await createBookmark(app, token, { title: 'Mine 2' });

      const other = await registerOtherUser();
      await createBookmark(app, other.accessToken, { title: 'Theirs' });

      const response = await request(app)
        .get('/api/bookmarks')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((b) => b.userId === user.id)).toBe(true);
    });

    it('paginates the results', async () => {
      for (let i = 1; i <= 5; i += 1) {
        await createBookmark(app, token, {
          title: `Bookmark ${i}`,
          url: `https://example.com/${i}`,
        });
      }

      const response = await request(app)
        .get('/api/bookmarks?page=1&limit=2')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 2,
        total: 5,
        totalPages: 3,
      });
    });

    it('searches title and url case-insensitively', async () => {
      await createBookmark(app, token, {
        title: 'PRISMA ORM GUIDE',
        url: 'https://example.com/a',
      });
      await createBookmark(app, token, {
        title: 'Another bookmark',
        url: 'https://PRISMA.io/docs',
      });
      await createBookmark(app, token, {
        title: 'Unrelated',
        url: 'https://example.com/other',
      });

      const response = await request(app)
        .get('/api/bookmarks?search=prisma')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(
        response.body.data.every(
          (b) =>
            b.title.toLowerCase().includes('prisma') ||
            b.url.toLowerCase().includes('prisma')
        )
      ).toBe(true);
    });

    it('filters by tag', async () => {
      await createBookmark(app, token, { title: 'Dev bookmark', tags: 'dev,node' });
      await createBookmark(app, token, { title: 'Other bookmark', tags: 'misc' });

      const response = await request(app)
        .get('/api/bookmarks?tag=dev')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].tags).toContain('dev');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/bookmarks/:id
  // ---------------------------------------------------------------------------
  describe('GET /api/bookmarks/:id', () => {
    it('returns a single bookmark', async () => {
      const { bookmark } = await createBookmark(app, token, { title: 'Single' });

      const response = await request(app)
        .get(`/api/bookmarks/${bookmark.id}`)
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.id).toBe(bookmark.id);
      expect(response.body.data.title).toBe('Single');
    });

    it("returns 404 for another user's bookmark", async () => {
      const other = await registerOtherUser();
      const { bookmark } = await createBookmark(app, other.accessToken, {
        title: 'Theirs',
      });

      const response = await request(app)
        .get(`/api/bookmarks/${bookmark.id}`)
        .set(authHeader(token));

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('error');
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/bookmarks/:id
  // ---------------------------------------------------------------------------
  describe('PATCH /api/bookmarks/:id', () => {
    it('updates an owned bookmark', async () => {
      const { bookmark } = await createBookmark(app, token);

      const response = await request(app)
        .patch(`/api/bookmarks/${bookmark.id}`)
        .set(authHeader(token))
        .send({ title: 'Updated title', url: 'https://updated.example.com' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.title).toBe('Updated title');
      expect(response.body.data.url).toBe('https://updated.example.com');
    });

    it("returns 404 when updating another user's bookmark", async () => {
      const other = await registerOtherUser();
      const { bookmark } = await createBookmark(app, other.accessToken, {
        title: 'Original',
      });

      const response = await request(app)
        .patch(`/api/bookmarks/${bookmark.id}`)
        .set(authHeader(token))
        .send({ title: 'Hijacked' });

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('error');

      // The other user's row must be untouched.
      const stored = await prisma.bookmark.findUnique({ where: { id: bookmark.id } });
      expect(stored.title).toBe('Original');
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/bookmarks/:id
  // ---------------------------------------------------------------------------
  describe('DELETE /api/bookmarks/:id', () => {
    it('deletes an owned bookmark', async () => {
      const { bookmark } = await createBookmark(app, token, { title: 'Doomed' });

      const response = await request(app)
        .delete(`/api/bookmarks/${bookmark.id}`)
        .set(authHeader(token));

      expect(response.status).toBe(204);

      const stored = await prisma.bookmark.findUnique({ where: { id: bookmark.id } });
      expect(stored).toBeNull();
    });

    it("returns 404 when deleting another user's bookmark", async () => {
      const other = await registerOtherUser();
      const { bookmark } = await createBookmark(app, other.accessToken, {
        title: 'Safe',
      });

      const response = await request(app)
        .delete(`/api/bookmarks/${bookmark.id}`)
        .set(authHeader(token));

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('error');

      // The row still exists because the owner was never the caller.
      const stored = await prisma.bookmark.findUnique({ where: { id: bookmark.id } });
      expect(stored).not.toBeNull();
    });
  });
});