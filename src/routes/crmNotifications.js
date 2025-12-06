import express from 'express';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from '../services/notifications.js';
import { requireAdminAuth } from '../middleware/adminAuth.js';

const router = express.Router();

// All routes require authentication
router.use(requireAdminAuth);

// Get all notifications
router.get('/', async (req, res) => {
  try {
    const { limit = 50, unreadOnly = false } = req.query;
    const notifications = await getNotifications({
      limit: parseInt(limit, 10),
      unreadOnly: unreadOnly === 'true',
    });
    return res.json({ ok: true, notifications });
  } catch (error) {
    console.error('[CRM Notifications] Failed to get notifications:', error);
    return res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// Get unread count
router.get('/unread-count', async (req, res) => {
  try {
    const count = await getUnreadCount();
    return res.json({ ok: true, count });
  } catch (error) {
    console.error('[CRM Notifications] Failed to get unread count:', error);
    return res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// Mark notification as read
router.post('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await markAsRead(parseInt(id, 10));
    if (success) {
      return res.json({ ok: true });
    }
    return res.status(404).json({ error: 'Notification not found' });
  } catch (error) {
    console.error('[CRM Notifications] Failed to mark as read:', error);
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.post('/mark-all-read', async (req, res) => {
  try {
    const success = await markAllAsRead();
    if (success) {
      return res.json({ ok: true });
    }
    return res.status(500).json({ error: 'Failed to mark all as read' });
  } catch (error) {
    console.error('[CRM Notifications] Failed to mark all as read:', error);
    return res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

export default router;

