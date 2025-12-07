import { verifyAdminToken, getAdminUserById } from '../services/adminAuth.js';

// Middleware to protect admin routes
export function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.substring(7);
  const payload = verifyAdminToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Attach admin info to request
  req.admin = payload;
  next();
}

// Middleware to require specific role
export function requireRole(allowedRoles) {
  return async (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const admin = await getAdminUserById(req.admin.id);
    if (!admin || !allowedRoles.includes(admin.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    req.adminRole = admin.role;
    next();
  };
}


