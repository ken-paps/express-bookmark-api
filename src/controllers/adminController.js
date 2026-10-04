const prisma = require('../config/prisma');

// Never expose the password hash in responses.
const sanitizeUser = (user) => {
  if (!user) return user;
  const { password, ...safeUser } = user;
  return safeUser;
};

// Parse and clamp pagination query params into safe integers.
const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 100);

  return { page, limit };
};

// Return a positive integer id, or null when the param is not a valid id.
const parseId = (raw) => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const paginationMeta = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit) || 0,
});

// ---- GET /api/admin/users (protected + admin) ----
const getAllUsers = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const { search } = req.query;

    const where = {};

    // Case-insensitive search across email OR name (MySQL utf8mb4_unicode_ci).
    if (search) {
      where.OR = [
        { email: { contains: String(search) } },
        { name: { contains: String(search) } },
      ];
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return res.status(200).json({
      status: 'success',
      data: users.map(sanitizeUser),
      pagination: paginationMeta(page, limit, total),
    });
  } catch (error) {
    return next(error);
  }
};

// ---- GET /api/admin/users/:id (protected + admin) ----
const getUserById = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user id',
      });
    }

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      data: sanitizeUser(user),
    });
  } catch (error) {
    return next(error);
  }
};

// ---- PATCH /api/admin/users/:id/role (protected + admin) ----
const updateUserRole = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user id',
      });
    }

    const { role } = req.body;

    // Only the two known roles are accepted.
    if (role !== 'user' && role !== 'admin') {
      return res.status(400).json({
        status: 'error',
        message: "Role must be either 'user' or 'admin'",
      });
    }

    // An admin may not change their own role (avoids locking themselves out).
    if (id === req.user.id) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot change your own role',
      });
    }

    const existing = await prisma.user.findUnique({ where: { id } });

    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role },
    });

    return res.status(200).json({
      status: 'success',
      data: sanitizeUser(user),
    });
  } catch (error) {
    return next(error);
  }
};

// ---- DELETE /api/admin/users/:id (protected + admin) ----
const deleteUser = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user id',
      });
    }

    // An admin may not delete themselves.
    if (id === req.user.id) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete yourself',
      });
    }

    const existing = await prisma.user.findUnique({ where: { id } });

    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    // Cascade removes the user's bookmarks and refresh tokens.
    await prisma.user.delete({ where: { id } });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
};

// ---- GET /api/admin/bookmarks (protected + admin) ----
const getAllBookmarks = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const { search, userId } = req.query;

    const where = {};

    // Filter by owner when a userId query param is supplied.
    if (userId !== undefined && userId !== '') {
      const ownerId = Number(userId);

      if (!Number.isInteger(ownerId) || ownerId <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid userId filter',
        });
      }

      where.userId = ownerId;
    }

    // Case-insensitive search across title OR url.
    if (search) {
      where.OR = [
        { title: { contains: String(search) } },
        { url: { contains: String(search) } },
      ];
    }

    const skip = (page - 1) * limit;

    const [bookmarks, total] = await Promise.all([
      prisma.bookmark.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { id: true, email: true, name: true } } },
      }),
      prisma.bookmark.count({ where }),
    ]);

    // Flatten the owner's email onto each bookmark so callers see whose it is.
    const data = bookmarks.map((bookmark) => {
      const { user, ...rest } = bookmark;
      return { ...rest, userEmail: user ? user.email : null };
    });

    return res.status(200).json({
      status: 'success',
      data,
      pagination: paginationMeta(page, limit, total),
    });
  } catch (error) {
    return next(error);
  }
};

// ---- DELETE /api/admin/bookmarks/:id (protected + admin) ----
const deleteAnyBookmark = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid bookmark id',
      });
    }

    const existing = await prisma.bookmark.findUnique({ where: { id } });

    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Bookmark not found',
      });
    }

    // Admins delete regardless of who owns the bookmark.
    await prisma.bookmark.delete({ where: { id } });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  updateUserRole,
  deleteUser,
  getAllBookmarks,
  deleteAnyBookmark,
};