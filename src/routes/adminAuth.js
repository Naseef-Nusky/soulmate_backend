import express from 'express';
import {
  verifyAdminCredentials,
  generateAdminToken,
  verifyAdminToken,
  getAdminUserById,
  createAdminUser,
  listAdminUsers,
} from '../services/adminAuth.js';
import { requireAdminAuth } from '../middleware/adminAuth.js';

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

    const token = generateAdminToken(admin);

    return res.json({
      ok: true,
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        role: admin.role,
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

    return res.json({
      ok: true,
      admin: {
        id: admin.id,
        username: admin.username,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('[AdminAuth] Verify token error:', error);
    return res.status(500).json({ error: 'Failed to verify token' });
  }
});

// List all admin users (protected)
router.get('/users', requireAdminAuth, async (req, res) => {
  try {
    const users = await listAdminUsers();
    return res.json({ ok: true, users });
  } catch (error) {
    console.error('[AdminAuth] Failed to list admin users:', error);
    return res.status(500).json({ error: 'Failed to list admin users' });
  }
});

// Create new admin user (protected)
router.post('/users', requireAdminAuth, async (req, res) => {
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

    await createAdminUser(username, password, role);

    return res.json({
      ok: true,
      message: `Admin user "${username}" created successfully`,
    });
  } catch (error) {
    console.error('[AdminAuth] Failed to create admin user:', error);
    if (error.message.includes('unique constraint') || error.message.includes('duplicate')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    return res.status(500).json({ error: 'Failed to create admin user' });
  }
});

export default router;

