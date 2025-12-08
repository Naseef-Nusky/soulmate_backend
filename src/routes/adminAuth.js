import express from 'express';
import {
  verifyAdminCredentials,
  generateAdminToken,
  verifyAdminToken,
  getAdminUserById,
  createAdminUser,
  listAdminUsers,
  deleteAdminUser,
  deactivateAdminUser,
  activateAdminUser,
} from '../services/adminAuth.js';
import { requireAdminAuth, requireSuperAdmin } from '../middleware/adminAuth.js';
import { getPool } from '../services/db.js';

const router = express.Router();

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const admin = await verifyAdminCredentials(username, password);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Get full admin details including created_at
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, username, role, created_at, updated_at FROM admin_users WHERE id = $1`,
      [admin.id]
    );
    const fullAdmin = rows[0] || admin;

    const token = generateAdminToken(admin);

    return res.json({
      ok: true,
      token,
      admin: {
        id: fullAdmin.id,
        username: fullAdmin.username,
        role: fullAdmin.role,
        created_at: fullAdmin.created_at,
      },
    });
  } catch (error) {
    console.error('[AdminAuth] Login error:', error);
    return res.status(500).json({ error: 'Failed to authenticate' });
  }
});

// Verify token and get current admin
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const payload = verifyAdminToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const admin = await getAdminUserById(payload.id);
    if (!admin) {
      return res.status(401).json({ error: 'Admin user not found' });
    }

    // Get full admin details including created_at
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, username, role, created_at, updated_at FROM admin_users WHERE id = $1`,
      [admin.id]
    );
    const fullAdmin = rows[0] || admin;

    return res.json({
      ok: true,
      admin: {
        id: fullAdmin.id,
        username: fullAdmin.username,
        role: fullAdmin.role,
        created_at: fullAdmin.created_at,
      },
    });
  } catch (error) {
    console.error('[AdminAuth] Verify token error:', error);
    return res.status(500).json({ error: 'Failed to verify token' });
  }
});

// List all admin users (protected) - SUPER ADMIN ONLY
router.get('/users', requireAdminAuth, requireSuperAdmin, async (req, res) => {
  try {
    const users = await listAdminUsers();
    return res.json({ ok: true, users });
  } catch (error) {
    console.error('[AdminAuth] Failed to list admin users:', error);
    return res.status(500).json({ error: 'Failed to list admin users' });
  }
});

// Create new admin user (protected) - SUPER ADMIN ONLY
router.post('/users', requireAdminAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { username, password, role = 'admin' } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Super admin cannot be created through the API - it's a system-only role
    if (role === 'super_admin') {
      return res.status(403).json({ error: 'Super admin role cannot be created. It is a system-only role.' });
    }

    await createAdminUser(username, password, role);

    return res.json({
      ok: true,
      message: `Admin user "${username}" created successfully`,
    });
  } catch (error) {
    console.error('[AdminAuth] Failed to create admin user:', error);
    if (error.message.includes('Username already exists') || error.message.includes('unique constraint') || error.message.includes('duplicate')) {
      return res.status(400).json({ error: 'Username already exists. Please choose a different username.' });
    }
    return res.status(500).json({ error: 'Failed to create admin user' });
  }
});

// Delete admin user (protected) - SUPER ADMIN ONLY
router.delete('/users/:userId', requireAdminAuth, requireSuperAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Prevent super admin from deleting themselves
    if (userId === req.admin.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    // Get the user to check if they exist
    const userToDelete = await getAdminUserById(userId);
    if (!userToDelete) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting super admin users (only one should exist)
    if (userToDelete.role === 'super_admin') {
      return res.status(403).json({ error: 'Super admin users cannot be deleted' });
    }

    await deleteAdminUser(userId);

    return res.json({
      ok: true,
      message: `Admin user "${userToDelete.username}" deleted successfully`,
    });
  } catch (error) {
    console.error('[AdminAuth] Failed to delete admin user:', error);
    if (error.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(500).json({ error: 'Failed to delete admin user' });
  }
});

// Deactivate admin user (protected) - SUPER ADMIN ONLY
router.post('/users/:userId/deactivate', requireAdminAuth, requireSuperAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Prevent super admin from deactivating themselves
    if (userId === req.admin.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }

    // Get the user to check if they exist and check role
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, username, role, is_active FROM admin_users WHERE id = $1`,
      [userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userToDeactivate = rows[0];
    
    // Prevent deactivating super admin users (they must always be active)
    if (userToDeactivate.role === 'super_admin') {
      return res.status(403).json({ error: 'Super admin users cannot be deactivated' });
    }
    
    if (userToDeactivate.is_active === false) {
      return res.status(400).json({ error: 'User is already deactivated' });
    }

    const user = await deactivateAdminUser(userId);

    return res.json({
      ok: true,
      message: `Admin user "${user.username}" deactivated successfully`,
    });
  } catch (error) {
    console.error('[AdminAuth] Failed to deactivate admin user:', error);
    if (error.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(500).json({ error: 'Failed to deactivate admin user' });
  }
});

// Activate admin user (protected) - SUPER ADMIN ONLY
router.post('/users/:userId/activate', requireAdminAuth, requireSuperAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Check if user exists (including inactive ones)
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, username, role, is_active FROM admin_users WHERE id = $1`,
      [userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (rows[0].is_active === true) {
      return res.status(400).json({ error: 'User is already active' });
    }

    const user = await activateAdminUser(userId);

    return res.json({
      ok: true,
      message: `Admin user "${user.username}" activated successfully`,
    });
  } catch (error) {
    console.error('[AdminAuth] Failed to activate admin user:', error);
    if (error.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(500).json({ error: 'Failed to activate admin user' });
  }
});

export default router;

