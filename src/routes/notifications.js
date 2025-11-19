import express from 'express';
import { sendSketchReadyEmail } from '../services/email.js';
import { findSignupByEmail } from '../services/auth.js';

const router = express.Router();

// Send sketch ready email
router.post('/sketch-ready', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const cleanedEmail = email.trim().toLowerCase();
    const signup = await findSignupByEmail(cleanedEmail);
    
    if (!signup) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get sketch URL - link to dashboard
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const sketchUrl = `${appUrl}/dashboard?tab=insight&showSoulmate=true`;

    await sendSketchReadyEmail({
      to: cleanedEmail,
      name: signup.name || null,
      sketchUrl,
    });

    res.json({ ok: true, message: 'Sketch ready email sent successfully' });
  } catch (error) {
    console.error('[Notifications] Error sending sketch ready email:', error);
    res.status(500).json({ error: error.message || 'Failed to send sketch ready email' });
  }
});

export default router;

