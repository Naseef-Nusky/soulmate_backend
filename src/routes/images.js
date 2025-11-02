import { Router } from 'express';
import { getImageDataById } from '../services/db.js';

const router = Router();

router.get('/:id', async (req, res) => {
  try {
    const resultId = parseInt(req.params.id, 10);
    if (isNaN(resultId)) {
      return res.status(400).json({ error: 'Invalid result ID' });
    }

    const imageData = await getImageDataById(resultId);
    
    if (!imageData) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Convert base64 to buffer and send as PNG
    const buffer = Buffer.from(imageData, 'base64');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.send(buffer);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Images] Error serving image:', err);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

export default router;


