import express from 'express';
import { translateTexts } from '../services/translate.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { texts, target, source } = req.body || {};
    
    // Validate inputs
    if (!target) {
      return res.status(400).json({ error: 'target language is required' });
    }
    if (!texts || (Array.isArray(texts) && texts.length === 0)) {
      return res.status(400).json({ error: 'texts array is required and cannot be empty' });
    }
    
    // Log request info for debugging
    const textCount = Array.isArray(texts) ? texts.length : 1;
    console.log(`[Translate] Request: ${textCount} texts to ${target}`);
    
    const trs = await translateTexts({ texts, target, source });
    res.json({ translations: trs });
  } catch (err) {
    console.error('[Translate] Error:', err?.message || err);
    console.error('[Translate] Stack:', err?.stack);
    res.status(500).json({ 
      error: 'Translation failed',
      message: err?.message || 'Unknown error'
    });
  }
});

export default router;







