import { Router } from 'express';
import { createJob } from '../services/db.js';
import { sendArtistRequestEmail } from '../services/email.js';

const router = Router();

// Minimal validation to avoid breaking flow
function sanitize(input) {
  if (!input || typeof input !== 'string') return '';
  return input.slice(0, 200).trim();
}

router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const answers = payload.answers || {};
    const birthDetails = payload.birthDetails || null;
    const email = payload.email || null;
    const contact = payload.contact || null; // phone or alt email
    const notes = payload.notes || null;

    // Fold extra fields into answers for storage
    const storedAnswers = {
      ...answers,
      artistRequest: {
        contact: sanitize(contact || ''),
        notes: sanitize(notes || ''),
        style: sanitize(payload.sketchStyle || 'pencil'),
      },
    };

    const job = await createJob({ answers: storedAnswers, birthDetails, email, type: 'artist' });

    // Notify artist team if configured
    try {
      await sendArtistRequestEmail({
        requestEmail: email || '',
        contact: contact || '',
        notes: notes || '',
        jobId: job?.id || null,
        answers: storedAnswers,
      });
    } catch {}

    return res.json({ jobId: job?.id || null, message: 'Artist sketch request received' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[Artist] Request failed', e);
    return res.status(500).json({ error: 'Failed to submit artist request' });
  }
});

export default router;





