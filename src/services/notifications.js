import { getPool } from './db.js';

// Create a notification in the CRM
export async function createNotification({ type, title, message, data = null }) {
  const pool = getPool();
  if (!pool) {
    console.warn('[Notifications] Database not available, skipping notification creation');
    return null;
  }

  try {
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

