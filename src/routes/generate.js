import { Router } from 'express';
import { calculateAstrology } from '../services/astrology.js';
import { generatePencilSketchFromAnswers } from '../services/openai.js';
import { saveResult } from '../services/db.js';
import { sendTwinFlameEmail } from '../services/email.js';
import { validateGeneratePayload } from '../utils/validators.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { value, error } = validateGeneratePayload(req.body);
    if (error) {
      return res.status(400).json({ error });
    }

    const { answers, birthDetails, email } = value;

    const astrology = calculateAstrology(birthDetails);

    // Generate ONLY a hand‑drawn style pencil sketch using quiz answers
    const image = await generatePencilSketchFromAnswers(answers, astrology);

    const stored = await saveResult({
      report: '',
      imageUrl: image?.url || null,
      imageData: image?.imageData || null,
      astrology,
      answers,
      email: email || null,
    });

    // Generate image URL from result ID if image data was stored
    const imageUrl = stored?.id && image?.imageData 
      ? `${req.protocol}://${req.get('host')}/api/images/${stored.id}`
      : (image?.url || null);

    if (email) {
      sendTwinFlameEmail({ to: email, imageUrl: imageUrl || '' })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[Email] TwinFlame send failed:', err?.response?.body || err?.message || err);
        });
    }

    return res.json({
      report: '',
      imageUrl,
      astrology,
      id: stored?.id || null,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    return res.status(500).json({ error: 'Failed to generate results' });
  }
});

export default router;



