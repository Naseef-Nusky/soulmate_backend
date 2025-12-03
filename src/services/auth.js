import { getPool } from './db.js';

export async function createSignup({ email, name, birthDate }) {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not available');
  }

  const cleanedEmail = email?.trim().toLowerCase();
  if (!cleanedEmail) {
    throw new Error('Email is required');
  }

  const result = await pool.query(
    `INSERT INTO signups (email, name, birth_date, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (email) DO UPDATE
       SET name = COALESCE(EXCLUDED.name, signups.name),
           birth_date = COALESCE(EXCLUDED.birth_date, signups.birth_date),
           -- Re-activate account on new signup with same email
           is_active = TRUE,
           deactivated_at = NULL,
           updated_at = NOW()
     RETURNING id, email, name, birth_date, is_active, deactivated_at, created_at, updated_at` ,
    [cleanedEmail, name?.trim() || null, birthDate || null]
  );

  return result.rows[0];
}

export async function findSignupByEmail(email) {
  const pool = getPool();
  if (!pool) return null;

  const cleanedEmail = email?.trim().toLowerCase();
  if (!cleanedEmail) return null;

  const { rows } = await pool.query(
    'SELECT id, email, name, birth_date, is_active, deactivated_at, created_at, updated_at FROM signups WHERE email = $1',
    [cleanedEmail]
  );

  return rows[0] || null;
}

// Simple token verification (using email as token for now)
// In production, use proper JWT tokens
export async function verifyToken(token) {
  if (!token) return null;

  try {
    // Simple token format: base64 encoded email or just email
    let email;
    try {
      // Try to decode as base64
      email = Buffer.from(token, 'base64').toString('utf-8');
    } catch {
      // If not base64, use token as email directly
      email = token;
    }

    const user = await findSignupByEmail(email);
    if (!user || user.is_active === false) return null;

    // Return user object with id for compatibility
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      birthDate: user.birth_date,
    };
  } catch (error) {
    console.error('[Auth] Token verification error:', error);
    return null;
  }
}

// Generate a simple token from email
export function generateToken(email) {
  // Simple base64 encoding of email
  return Buffer.from(email.trim().toLowerCase()).toString('base64');
}

// Generate a login link token (expires in 24 hours)
export function generateLoginToken(email) {
  const timestamp = Date.now();
  const expiry = timestamp + (24 * 60 * 60 * 1000); // 24 hours
  const data = `${email.trim().toLowerCase()}:${expiry}`;
  return Buffer.from(data).toString('base64');
}

// Verify login token
export function verifyLoginToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [email, expiry] = decoded.split(':');
    const expiryTime = parseInt(expiry, 10);
    
    if (Date.now() > expiryTime) {
      return null; // Token expired
    }
    
    return email;
  } catch {
    return null; // Invalid token
  }
}

// Update user profile
export async function updateProfile(userId, profileData) {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not available');
  }

  const {
    name,
    gender,
    placeOfBirth,
    birthDate,
    birthTime,
    relationshipStatus,
  } = profileData;

  // Build update query dynamically
  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(name?.trim() || null);
  }
  if (gender !== undefined) {
    updates.push(`gender = $${paramIndex++}`);
    values.push(gender || null);
  }
  if (placeOfBirth !== undefined) {
    updates.push(`place_of_birth = $${paramIndex++}`);
    values.push(placeOfBirth?.trim() || null);
  }
  if (birthDate !== undefined) {
    updates.push(`birth_date = $${paramIndex++}`);
    values.push(birthDate || null);
  }
  if (birthTime !== undefined) {
    updates.push(`birth_time = $${paramIndex++}`);
    values.push(birthTime || null);
  }
  if (relationshipStatus !== undefined) {
    updates.push(`relationship_status = $${paramIndex++}`);
    values.push(relationshipStatus || null);
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  updates.push(`updated_at = NOW()`);
  values.push(userId);

  const query = `
    UPDATE signups 
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, email, name, gender, place_of_birth, birth_date, birth_time, relationship_status, created_at, updated_at
  `;

  const result = await pool.query(query, values);
  return result.rows[0];
}

// Get user profile by ID
export async function getProfile(userId) {
  const pool = getPool();
  if (!pool) return null;

  const { rows } = await pool.query(
    `SELECT id, email, name, gender, place_of_birth, birth_date, birth_time, relationship_status, is_active, deactivated_at, created_at, updated_at 
     FROM signups WHERE id = $1`,
    [userId]
  );

  return rows[0] || null;
}

// Deactivate a signup account (e.g., after subscription fully ends)
export async function deactivateSignupByEmail(email) {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not available');
  }

  const cleanedEmail = email?.trim().toLowerCase();
  if (!cleanedEmail) {
    throw new Error('Email is required');
  }

  await pool.query(
    `UPDATE signups 
     SET is_active = FALSE,
         deactivated_at = NOW(),
         updated_at = NOW()
     WHERE email = $1`,
    [cleanedEmail]
  );
}








