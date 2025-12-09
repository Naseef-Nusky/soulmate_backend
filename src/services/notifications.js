import { getPool } from './db.js';

// Create a notification in the CRM
export async function createNotification({ type, title, message, data = null }) {
  const pool = getPool();
  if (!pool) {
    console.warn('[Notifications] Database not available, skipping notification creation');
    return null;
  }

  try {
    // Dedupe: avoid inserting identical notifications within a short window
    // This prevents double "new_signup" alerts when both webhook and register flow run
    const dedupeWindowMinutes = 10;
    const { rows: existing } = await pool.query(
      `SELECT id FROM crm_notifications
       WHERE type = $1
         AND message = $2
         AND created_at > NOW() - ($3::interval)
       LIMIT 1`,
      [type, message, `${dedupeWindowMinutes} minutes`]
    );

    if (existing.length > 0) {
      console.log(`[Notifications] Skipping duplicate notification (type=${type}) within ${dedupeWindowMinutes} minutes`);
      return existing[0];
    }

    const { rows } = await pool.query(
      `INSERT INTO crm_notifications (type, title, message, data, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, type, title, message, data, is_read, created_at`,
      [type, title, message, data ? JSON.stringify(data) : null]
    );
    return rows[0];
  } catch (error) {
    console.error('[Notifications] Failed to create notification:', error);
    return null;
  }
}

// Get all notifications
export async function getNotifications({ limit = 50, unreadOnly = false } = {}) {
  const pool = getPool();
  if (!pool) {
    return [];
  }

  try {
    let query = `SELECT id, type, title, message, data, is_read, created_at
                 FROM crm_notifications`;
    const params = [];
    
    if (unreadOnly) {
      query += ` WHERE is_read = FALSE`;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $1`;
    params.push(limit);

    const { rows } = await pool.query(query, params);
    return rows.map((row) => ({
      ...row,
      data: row.data ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : null,
    }));
  } catch (error) {
    console.error('[Notifications] Failed to get notifications:', error);
    return [];
  }
}

// Get unread notification count
export async function getUnreadCount() {
  const pool = getPool();
  if (!pool) {
    return 0;
  }

  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) as count FROM crm_notifications WHERE is_read = FALSE`
    );
    return parseInt(rows[0]?.count || '0', 10);
  } catch (error) {
    console.error('[Notifications] Failed to get unread count:', error);
    return 0;
  }
}

// Mark notification as read
export async function markAsRead(notificationId) {
  const pool = getPool();
  if (!pool) {
    return false;
  }

  try {
    await pool.query(
      `UPDATE crm_notifications SET is_read = TRUE WHERE id = $1`,
      [notificationId]
    );
    return true;
  } catch (error) {
    console.error('[Notifications] Failed to mark notification as read:', error);
    return false;
  }
}

// Mark all notifications as read
export async function markAllAsRead() {
  const pool = getPool();
  if (!pool) {
    return false;
  }

  try {
    await pool.query(`UPDATE crm_notifications SET is_read = TRUE WHERE is_read = FALSE`);
    return true;
  } catch (error) {
    console.error('[Notifications] Failed to mark all as read:', error);
    return false;
  }
}


