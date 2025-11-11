import { Router } from 'express';
import { verifySmtpAndSendTest } from '../services/email.js';

const router = Router();

// POST /api/debug/test-email { to?: string }
router.post('/test-email', async (req, res) => {
  try {
    const to = (req.body?.to || '').trim();
    const messageId = await verifySmtpAndSendTest(to);
    return res.json({ ok: true, messageId });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[Debug] test-email failed:', e?.message || e);
    return res.status(500).json({ ok: false, error: e?.message || 'Failed to send test email' });
  }
});

export default router;




