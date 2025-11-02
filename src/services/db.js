import { Pool } from 'pg';

let pool;

export async function initDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;
  try {
    pool = new Pool({ connectionString, ssl: false });
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
    // eslint-disable-next-line no-console
    console.log('[DB] Connected and initialized.');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[DB] Failed to connect or init. Continuing without DB. Set DATABASE_URL to enable.');
    pool = undefined;
  }
}

export async function saveResult({ report, imageUrl, imageData, astrology, answers, email }) {
  if (!pool) return null;
  const { rows } = await pool.query(
    `INSERT INTO results (report, image_url, image_data, astrology, answers, email)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [report, imageUrl ?? null, imageData ?? null, astrology ?? null, answers ?? null, email ?? null]
  );
  return rows[0];
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
    `SELECT id, created_at, report, image_url, astrology, answers, email FROM results WHERE id=$1`,
    [resultId]
  );
  return rows[0] || null;
}


