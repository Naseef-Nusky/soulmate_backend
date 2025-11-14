import express from 'express';
import { translateTexts } from '../services/translate.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { texts, target, source } = req.body || {};
    if (!target || (!texts && texts !== '')) {
      return res.status(400).json({ error: 'texts and target are required' });
    }
    const trs = await translateTexts({ texts, target, source });
    res.json({ translations: trs });
  } catch (err) {
    console.error('[Translate] Error:', err?.message || err);
    res.status(500).json({ error: 'Translation failed' });
  }
});

export default router;




