const { validationResult } = require('express-validator');

const prisma = require('../config/prisma');

const validationError = (res, errors) =>
  res.status(400).json({
    status: 'error',
    message: 'Validation failed',
    errors: errors.array().map(({ path, msg }) => ({ field: path, message: msg })),
  });

// Parse and clamp pagination query params into safe integers.
const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 100);

  return { page, limit };
};

// ---- GET /api/bookmarks (protected) ----
const getAllBookmarks = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const { search, tag } = req.query;

    // Ownership: every query is scoped to the authenticated user.
    const where = { userId: req.user.id };

    // Case-insensitive search across title OR url (MySQL utf8mb4_unicode_ci).
    if (search) {
      where.OR = [
        { title: { contains: String(search) } },
        { url: { contains: String(search) } },
      ];
    }

    // Tag filter: match any comma-separated tag containing the value.
    if (tag) {
      where.tags = { contains: String(tag) };
    }

    const skip = (page - 1) * limit;

    const [bookmarks, total] = await Promise.all([
      prisma.bookmark.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.bookmark.count({ where }),
    ]);

    return res.status(200).json({
      status: 'success',
      data: bookmarks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    });
  } catch (error) {
    return next(error);
  }
};

// ---- GET /api/bookmarks/:id (protected) ----
const getBookmarkById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid bookmark id',
      });
    }

    // findFirst + userId scope: a bookmark owned by someone else looks "not found".
    const bookmark = await prisma.bookmark.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!bookmark) {
      return res.status(404).json({
        status: 'error',
        message: 'Bookmark not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      data: bookmark,
    });
  } catch (error) {
    return next(error);
  }
};

// ---- POST /api/bookmarks (protected) ----
const createBookmark = async (req, res, next) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return validationError(res, errors);
    }

    const { title, url, description, tags } = req.body;

    const bookmark = await prisma.bookmark.create({
      data: {
        title,
        url,
        description: description ?? null,
        tags: tags ?? null,
        // Always assign the owner from the authenticated user, never the body.
        userId: req.user.id,
      },
    });

    return res.status(201).json({
      status: 'success',
      data: bookmark,
    });
  } catch (error) {
    return next(error);
  }
};

// ---- PATCH /api/bookmarks/:id (protected) ----
const updateBookmark = async (req, res, next) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return validationError(res, errors);
    }

    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid bookmark id',
      });
    }

    const existing = await prisma.bookmark.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Bookmark not found',
      });
    }

    const { title, url, description, tags } = req.body;

    // Only update the fields that were actually provided.
    const data = {};
    if (title !== undefined) data.title = title;
    if (url !== undefined) data.url = url;
    if (description !== undefined) data.description = description;
    if (tags !== undefined) data.tags = tags;

    const bookmark = await prisma.bookmark.update({
      where: { id },
      data,
    });

    return res.status(200).json({
      status: 'success',
      data: bookmark,
    });
  } catch (error) {
    return next(error);
  }
};

// ---- DELETE /api/bookmarks/:id (protected) ----
const deleteBookmark = async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid bookmark id',
      });
    }

    const existing = await prisma.bookmark.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Bookmark not found',
      });
    }

    await prisma.bookmark.delete({ where: { id } });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAllBookmarks,
  getBookmarkById,
  createBookmark,
  updateBookmark,
  deleteBookmark,
};