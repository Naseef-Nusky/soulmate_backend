import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { calculateAstrology } from '../services/astrology.js';
import { generatePencilSketchFromAnswers } from '../services/openai.js';
import { saveResult } from '../services/db.js';
import { sendTwinFlameEmail } from '../services/email.js';
import { uploadPngToSpaces } from '../services/storage.js';
import { validateGeneratePayload } from '../utils/validators.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { value, error } = validateGeneratePayload(req.body);
    if (error) {
      return res.status(400).json({ error });
    }

    const { answers, birthDetails, email } = value;

    // Capture ALL step data from the request body as JSON (including any extra fields)
    const stepData = {
      ...req.body, // Include everything from the request
      answers,
      birthDetails,
      email,
      timestamp: new Date().toISOString(),
      // This ensures all quiz step data is preserved
    };

    const astrology = calculateAstrology(birthDetails);

    // Generate ONLY a hand‑drawn style pencil sketch using quiz answers
    const image = await generatePencilSketchFromAnswers(answers, astrology);

    // Try to upload to Spaces when we have base64 data (preferred storage)
    let spacesUrl = null;
    if (image?.imageData) {
      try {
        const objectKey = `sketch-${Date.now()}.png`;
        spacesUrl = await uploadPngToSpaces({ key: objectKey, dataBase64: image.imageData });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[Images] Spaces upload failed (primary):', err?.message || err);
      }
    }

    const stored = await saveResult({
      report: '',
      imageUrl: spacesUrl || image?.url || null,
      imageData: spacesUrl ? null : (image?.imageData || null),
      astrology,
      answers,
      email: email || null,
      stepData, // Save all step data as JSON
    });

    // Determine a visible image URL
    let imageUrl = null;
    if (spacesUrl) {
      imageUrl = spacesUrl;
    } else if (stored?.id && (image?.imageData || stored?.id)) {
      // Served from DB
      imageUrl = `${req.protocol}://${req.get('host')}/api/images/${stored.id}`;
    } else if (!stored?.id && image?.imageData) {
      // DB unavailable: prefer Spaces; fall back to local uploads
      const objectKey = `sketch-${Date.now()}.png`;
      try {
        const uploaded = await uploadPngToSpaces({ key: objectKey, dataBase64: image.imageData });
        if (uploaded) {
          imageUrl = uploaded;
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[Images] Spaces upload failed:', err?.message || err);
      }
      if (!imageUrl) {
        try {
          const uploadsDir = path.resolve(process.cwd(), 'uploads');
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          const filePath = path.join(uploadsDir, objectKey);
          fs.writeFileSync(filePath, Buffer.from(image.imageData, 'base64'));
          imageUrl = `${req.protocol}://${req.get('host')}/uploads/${objectKey}`;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[Images] Failed to write upload fallback:', err?.message || err);
        }
      }
    } else {
      imageUrl = image?.url || null;
    }

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



