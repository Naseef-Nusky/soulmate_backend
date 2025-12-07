import { getPool } from './db.js';
import crypto from 'crypto';

// Hash password using SHA-256 (simple, for admin use)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Create admin user (run once to set up initial admin)
// Note: Default is 'super_admin' for script usage, but API should not allow super_admin creation
export async function createAdminUser(username, password, role = 'super_admin') {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not available');
  }

  const hashedPassword = hashPassword(password);

  try {
    await pool.query(
      `INSERT INTO admin_users (username, password_hash, role, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (username) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role,
             updated_at = NOW()
       RETURNING id, username, role, created_at`,
      [username, hashedPassword, role]
    );
    console.log(`[AdminAuth] Admin user "${username}" created/updated with role "${role}"`);
  } catch (error) {
    console.error('[AdminAuth] Failed to create admin user:', error);
    throw error;
  }
}

// Verify admin credentials
export async function verifyAdminCredentials(username, password) {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not available');
  }

  const hashedPassword = hashPassword(password);

  const { rows } = await pool.query(
    `SELECT id, username, role, created_at FROM admin_users 
     WHERE username = $1 AND password_hash = $2 AND is_active = TRUE`,
    [username, hashedPassword]
  );

  if (rows.length === 0) {
    return null;
  }

  return rows[0];
}

// Get admin user by ID
export async function getAdminUserById(id) {
  const pool = getPool();
  if (!pool) {
    return null;
  }

  const { rows } = await pool.query(
    `SELECT id, username, role, created_at FROM admin_users 
     WHERE id = $1 AND is_active = TRUE`,
    [id]
  );

  return rows[0] || null;
}

// List all admin users
export async function listAdminUsers() {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not available');
  }

  const { rows } = await pool.query(
    `SELECT id, username, role, is_active, created_at, updated_at 
     FROM admin_users 
     ORDER BY created_at DESC`
  );

  return rows;
}

// Delete admin user by ID
export async function deleteAdminUser(userId) {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not available');
  }

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM admin_users WHERE id = $1`,
      [userId]
    );
    
    if (rowCount === 0) {
      throw new Error('User not found');
    }
    
    console.log(`[AdminAuth] Admin user with ID "${userId}" deleted successfully`);
    return true;
  } catch (error) {
    console.error('[AdminAuth] Failed to delete admin user:', error);
    throw error;
  }
}

// Deactivate admin user by ID
export async function deactivateAdminUser(userId) {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not available');
  }

  try {
    const { rows } = await pool.query(
      `UPDATE admin_users 
       SET is_active = FALSE, updated_at = NOW() 
       WHERE id = $1 
       RETURNING id, username, role`,
      [userId]
    );
    
    if (rows.length === 0) {
      throw new Error('User not found');
    }
    
    console.log(`[AdminAuth] Admin user "${rows[0].username}" (ID: ${userId}) deactivated successfully`);
    return rows[0];
  } catch (error) {
    console.error('[AdminAuth] Failed to deactivate admin user:', error);
    throw error;
  }
}

// Activate admin user by ID
export async function activateAdminUser(userId) {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not available');
  }

  try {
    const { rows } = await pool.query(
      `UPDATE admin_users 
       SET is_active = TRUE, updated_at = NOW() 
       WHERE id = $1 
       RETURNING id, username, role`,
      [userId]
    );
    
    if (rows.length === 0) {
      throw new Error('User not found');
    }
    
    console.log(`[AdminAuth] Admin user "${rows[0].username}" (ID: ${userId}) activated successfully`);
    return rows[0];
  } catch (error) {
    console.error('[AdminAuth] Failed to activate admin user:', error);
    throw error;
  }
}

// Generate a simple token (in production, use JWT)
export function generateAdminToken(adminUser) {
  const payload = {
    id: adminUser.id,
    username: adminUser.username,
    role: adminUser.role,
    timestamp: Date.now(),
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

// Verify admin token
export function verifyAdminToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    // Token expires after 24 hours
    if (Date.now() - payload.timestamp > 24 * 60 * 60 * 1000) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

