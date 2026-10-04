// ---- requireAdmin: must run AFTER `protect` ----
// `protect` loads the fresh user record from the database onto `req.user`
// (never trusting the JWT payload), so the role check here is authoritative.
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      error: 'Admin access required',
      message: 'Admin access required',
    });
  }

  return next();
};

module.exports = { requireAdmin };