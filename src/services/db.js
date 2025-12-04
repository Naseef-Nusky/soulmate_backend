import { Pool } from 'pg';

const LOG_DB = process.env.LOG_DB === 'true';

let pool;

export async function initDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn('[DB] DATABASE_URL not set. Continuing without DB.');
    return;
  }
  
  try {
    // Check if SSL is required (DigitalOcean uses sslmode=require)
    const useSsl = /sslmode=require/i.test(connectionString);
    
    // Extract host info for logging (without exposing password)
    try {
      const url = new URL(connectionString.replace(/^postgresql:/, 'http:'));
      console.log(`[DB] Attempting connection to ${url.hostname}:${url.port || 5432} (SSL: ${useSsl ? 'on' : 'off'})`);
    } catch {}
    
    // For DigitalOcean: use SSL with rejectUnauthorized: false to skip CA verification
    // This handles self-signed certificates in the chain
    // Note: Must set ssl object directly, not conditional false
    const poolConfig = {
      connectionString,
    };
    
    if (useSsl) {
      // DigitalOcean requires SSL but uses self-signed certs
      // rejectUnauthorized: false tells Node.js to accept any certificate
      poolConfig.ssl = {
        rejectUnauthorized: false
      };
    }
    
    pool = new Pool(poolConfig);
    
    // Test connection immediately
    const testClient = await pool.connect();
    await testClient.query('SELECT NOW()');
    testClient.release();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS results (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        report TEXT NOT NULL,
        image_url TEXT,
        image_data TEXT,
        astrology JSONB,
        answers JSONB,
        email TEXT
      );
    `);
    // Add image_data column if it doesn't exist (for existing databases)
    await pool.query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS image_data TEXT;`);
    // Add step_data column to store all quiz step data as JSON
    await pool.query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS step_data JSONB;`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        status TEXT NOT NULL DEFAULT 'queued',
        type TEXT NOT NULL DEFAULT 'ai',
        email TEXT,
        answers JSONB,
        birth_details JSONB,
        result_id INTEGER REFERENCES results(id) ON DELETE SET NULL,
        error TEXT
      );
    `);
    // Ensure type column exists for older deployments
    await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'ai';`);
    
    // Create signups table for storing user registrations
    await pool.query(`
      CREATE TABLE IF NOT EXISTS signups (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        gender TEXT,
        place_of_birth TEXT,
        birth_date DATE,
        birth_time TIME,
        relationship_status TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_test BOOLEAN NOT NULL DEFAULT FALSE,
        deactivated_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // Add new columns if they don't exist (for existing databases)
    await pool.query(`ALTER TABLE signups ADD COLUMN IF NOT EXISTS gender TEXT;`);
    await pool.query(`ALTER TABLE signups ADD COLUMN IF NOT EXISTS place_of_birth TEXT;`);
    await pool.query(`ALTER TABLE signups ADD COLUMN IF NOT EXISTS birth_time TIME;`);
    await pool.query(`ALTER TABLE signups ADD COLUMN IF NOT EXISTS relationship_status TEXT;`);
    await pool.query(`ALTER TABLE signups ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE signups ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE signups ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP WITH TIME ZONE;`);
    
    // Create horoscopes table for caching generated horoscopes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS horoscopes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        date TEXT NOT NULL,
        guidance TEXT NOT NULL,
        emotion_score INTEGER,
        energy_score INTEGER,
        month INTEGER,
        year INTEGER,
        month_name TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, type, date)
      );
    `);
    
    
    // eslint-disable-next-line no-console
    console.log('[DB] Connected and initialized.');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[DB] Connection failed!');
    // eslint-disable-next-line no-console
    console.error('[DB] Error code:', err?.code || 'UNKNOWN');
    // eslint-disable-next-line no-console
    console.error('[DB] Error message:', err?.message || String(err));
    
    // Common error explanations
    if (err?.code === 'ETIMEDOUT' || err?.code === 'ECONNREFUSED') {
      console.error('[DB] → Connection timeout/refused. Check:');
      console.error('[DB]   1. Is your IP address in DigitalOcean "Trusted Sources"?');
      console.error('[DB]   2. Is the hostname and port (25060) correct?');
      console.error('[DB]   3. Is PostgreSQL running on the server?');
    } else if (err?.code === 'ENOTFOUND') {
      console.error('[DB] → Hostname not found. Check DATABASE_URL hostname is correct.');
    } else if (err?.message?.includes('password') || err?.message?.includes('authentication')) {
      console.error('[DB] → Authentication failed. Check username and password in DATABASE_URL.');
    } else if (err?.message?.includes('SSL') || err?.message?.includes('TLS')) {
      console.error('[DB] → SSL error. Ensure DATABASE_URL ends with ?sslmode=require');
    }
    
    pool = undefined;
  }
}

export async function saveResult({ report, imageUrl, imageData, astrology, answers, email, stepData }) {
  if (!pool) return null;
  const { rows } = await pool.query(
    `INSERT INTO results (report, image_url, image_data, astrology, answers, email, step_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [report, imageUrl ?? null, imageData ?? null, astrology ?? null, answers ?? null, email ?? null, stepData ?? null]
  );
  return rows[0];
}

export async function updateResult(resultId, { report, imageUrl, imageData, astrology, answers, email, stepData }) {
  if (!pool) return null;
  if (!resultId) return null;
  
  const updates = [];
  const values = [];
  let paramCount = 1;
  
  if (report !== undefined) {
    updates.push(`report = $${paramCount++}`);
    values.push(report);
  }
  if (imageUrl !== undefined) {
    updates.push(`image_url = $${paramCount++}`);
    values.push(imageUrl);
  }
  if (imageData !== undefined) {
    updates.push(`image_data = $${paramCount++}`);
    values.push(imageData);
  }
  if (astrology !== undefined) {
    updates.push(`astrology = $${paramCount++}`);
    values.push(astrology);
  }
  if (answers !== undefined) {
    updates.push(`answers = $${paramCount++}`);
    values.push(answers);
  }
  if (email !== undefined) {
    updates.push(`email = $${paramCount++}`);
    values.push(email);
  }
  if (stepData !== undefined) {
    updates.push(`step_data = $${paramCount++}`);
    values.push(stepData);
  }
  
  if (updates.length === 0) return null;
  
  values.push(resultId);
  const { rows } = await pool.query(
    `UPDATE results SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, created_at`,
    values
  );
  return rows[0] || null;
}

export async function getImageDataById(resultId) {
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT image_data FROM results WHERE id=$1`,
    [resultId]
  );
  return rows[0]?.image_data || null;
}

export async function createJob({ answers, birthDetails, email, type = 'ai' }) {
  if (!pool) return null;
  const { rows } = await pool.query(
    `INSERT INTO jobs (status, type, email, answers, birth_details)
     VALUES ('queued', $1, $2, $3, $4)
     RETURNING id`,
    [type || 'ai', email ?? null, answers ?? null, birthDetails ?? null]
  );
  return rows[0];
}

export async function pickNextJob() {
  if (!pool) return null;
  const { rows } = await pool.query(
    `UPDATE jobs SET status='processing', updated_at=NOW()
     WHERE id = (
      SELECT id FROM jobs WHERE status='queued' AND (type IS NULL OR type='ai') ORDER BY created_at ASC LIMIT 1
     )
     RETURNING *`
  );
  return rows[0] || null;
}

export async function completeJob(jobId, { resultId }) {
  if (!pool) return;
  await pool.query(
    `UPDATE jobs SET status='completed', result_id=$2, updated_at=NOW() WHERE id=$1`,
    [jobId, resultId ?? null]
  );
}

export async function failJob(jobId, error) {
  if (!pool) return;
  await pool.query(
    `UPDATE jobs SET status='failed', error=$2, updated_at=NOW() WHERE id=$1`,
    [jobId, String(error).slice(0, 2000)]
  );
}

export async function getJob(jobId) {
  if (!pool) return null;
  const { rows } = await pool.query(`SELECT * FROM jobs WHERE id=$1`, [jobId]);
  return rows[0] || null;
}

export async function getResultById(resultId) {
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT id, created_at, report, image_url, astrology, answers, email, step_data FROM results WHERE id=$1`,
    [resultId]
  );
  return rows[0] || null;
}

export async function getAllResults() {
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT id, created_at, report, image_url, astrology, answers, email, step_data 
     FROM results 
     ORDER BY created_at DESC`
  );
  return rows || [];
}

export async function getResultsByEmail(email) {
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT id, created_at, report, image_url, astrology, answers, email, step_data 
     FROM results 
     WHERE email = $1 
     ORDER BY created_at DESC`,
    [email]
  );
  return rows || [];
}

export async function getLatestResultByEmail(email) {
  if (!pool) return null;
  if (!email) return null;
  const cleanedEmail = email.trim().toLowerCase();
  
  // First try exact email match
  let { rows } = await pool.query(
    `SELECT id, created_at, report, image_url, astrology, answers, email, step_data 
     FROM results 
     WHERE LOWER(TRIM(email)) = $1 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [cleanedEmail]
  );
  
  // If no exact match, try searching in step_data JSON for email
  if (rows.length === 0) {
    const { rows: jsonRows } = await pool.query(
      `SELECT id, created_at, report, image_url, astrology, answers, email, step_data 
       FROM results 
       WHERE step_data::text ILIKE $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [`%${cleanedEmail}%`]
    );
    rows = jsonRows;
  }
  
  if (rows.length > 0) {
    console.log(`[DB] Found quiz result for ${cleanedEmail}: result ID ${rows[0].id}, saved email: ${rows[0].email || 'null'}`);
  } else {
    console.warn(`[DB] No quiz result found for ${cleanedEmail}. Checking all recent results...`);
    // Debug: show recent results to help diagnose
    const { rows: recentRows } = await pool.query(
      `SELECT id, email, created_at, step_data->>'email' as step_email
       FROM results 
       WHERE created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC 
       LIMIT 5`
    );
    if (recentRows.length > 0) {
      console.log(`[DB] Recent results (last 24h):`, recentRows.map(r => ({
        id: r.id,
        email: r.email,
        step_email: r.step_email,
        created: r.created_at
      })));
    }
  }
  
  return rows[0] || null;
}

export async function saveHoroscope({ userId, type, date, guidance, emotionScore, energyScore, month, year, monthName }) {
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO horoscopes (user_id, type, date, guidance, emotion_score, energy_score, month, year, month_name, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (user_id, type, date) DO UPDATE
         SET guidance = EXCLUDED.guidance,
             emotion_score = EXCLUDED.emotion_score,
             energy_score = EXCLUDED.energy_score,
             month = EXCLUDED.month,
             year = EXCLUDED.year,
             month_name = EXCLUDED.month_name,
             created_at = NOW()
       RETURNING id`,
      [userId, type, date, guidance, emotionScore || null, energyScore || null, month || null, year || null, monthName || null]
    );
    return rows[0];
  } catch (error) {
    console.error('[DB] Error saving horoscope:', error);
    return null;
  }
}

export async function getHoroscope(userId, type, date) {
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, type, date, guidance, emotion_score, energy_score, month, year, month_name, created_at
       FROM horoscopes
       WHERE user_id = $1 AND type = $2 AND date = $3
       LIMIT 1`,
      [userId, type, date]
    );
    if (rows.length > 0) {
      return {
        guidance: rows[0].guidance,
        emotionScore: rows[0].emotion_score,
        energyScore: rows[0].energy_score,
        date: rows[0].date,
        type: rows[0].type,
        month: rows[0].month,
        year: rows[0].year,
        monthName: rows[0].month_name,
      };
    }
    return null;
  } catch (error) {
    console.error('[DB] Error getting horoscope:', error);
    return null;
  }
}

export async function getResultsByDateRange(startDate, endDate) {
  if (!pool) return null;
  let query = `SELECT id, created_at, report, image_url, astrology, answers, email, step_data 
               FROM results WHERE 1=1`;
  const params = [];
  let paramCount = 0;
  
  if (startDate) {
    paramCount++;
    query += ` AND created_at >= $${paramCount}`;
    params.push(startDate);
  }
  
  if (endDate) {
    paramCount++;
    query += ` AND created_at <= $${paramCount}`;
    params.push(endDate);
  }
  
  query += ` ORDER BY created_at DESC`;
  
  const { rows } = await pool.query(query, params);
  return rows || [];
}

export async function getPendingSketchReleaseResults(limit = 10) {
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT id, email, image_url, image_data, step_data
     FROM results
     WHERE step_data IS NOT NULL
       AND step_data->>'sketchReleaseAt' IS NOT NULL
       AND (step_data->>'twinFlameEmailSent' IS NULL OR step_data->>'twinFlameEmailSent' = 'false')
       AND (step_data->>'sketchReleaseAt')::timestamptz <= NOW()
     ORDER BY (step_data->>'sketchReleaseAt')::timestamptz ASC
     LIMIT $1`,
    [limit]
  );
  return rows || [];
}

export async function updateResultSpeedOption(resultId, speedOption) {
  if (!pool) return null;
  try {
    // Get current step_data
    const { rows: currentRows } = await pool.query(
      `SELECT step_data FROM results WHERE id = $1`,
      [resultId]
    );
    
    if (currentRows.length === 0) {
      return null;
    }
    
    const currentStepData = currentRows[0].step_data || {};
    const now = new Date();
    let readyAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default: 24 hours
    let timingOption = 'standard';
    
    if (speedOption === 'speed') {
      readyAt = new Date(now.getTime() + 3 * 60 * 60 * 1000); // 3 hours
      timingOption = 'speed';
    } else if (speedOption === 'express') {
      readyAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes
      timingOption = 'express';
    }
    
    // Update step_data with new speed option
    const updatedStepData = {
      ...currentStepData,
      speedOption,
      timingOption,
      readyAt: readyAt.toISOString(),
    };
    
    const { rows } = await pool.query(
      `UPDATE results SET step_data = $1 WHERE id = $2 RETURNING id, step_data`,
      [updatedStepData, resultId]
    );
    
    return rows[0] || null;
  } catch (error) {
    console.error('[DB] Error updating speed option:', error);
    return null;
  }
}

// Export pool for use in other modules
export function getPool() {
  return pool;
}

export async function findRecentJobByEmail(email) {
  if (!pool) return null;
  if (!email) return null;
  const cleanedEmail = email.trim().toLowerCase();
  const { rows } = await pool.query(
    `SELECT id, status, created_at 
     FROM jobs 
     WHERE email = $1 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [cleanedEmail]
  );
  return rows[0] || null;
}


