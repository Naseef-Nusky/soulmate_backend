import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { calculateAstrology, generateDailyHoroscope } from '../services/astrology.js';
import { generatePencilSketchFromAnswers } from '../services/openai.js';
import { saveResult } from '../services/db.js';
import { uploadPngToSpaces } from '../services/storage.js';
import { validateGeneratePayload } from '../utils/validators.js';
import { createSignup } from '../services/auth.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { value, error } = validateGeneratePayload(req.body);
    if (error) {
      return res.status(400).json({ error });
    }

    const { answers, birthDetails, email } = value;

    // If email provided, sign up the user (but don't send magic link yet)
    let userSignup = null;
    if (email) {
      try {
        userSignup = await createSignup({
          email,
          name: answers.name || null,
          birthDate: birthDetails?.date || null,
        });
      } catch (signupError) {
        console.error('[Generate] Failed to signup user:', signupError);
        // Continue with quiz generation even if signup fails
      }
    }

    // Capture ALL step data from the request body as JSON (including any extra fields)
    const releaseDelayMinutes = Number(process.env.SKETCH_RELEASE_DELAY_MINUTES || 600);
    const promisedWindowHours = Number(process.env.SKETCH_PROMISED_HOURS || 24);
    const sketchGeneratedAt = new Date();
    const sketchReleaseAt = new Date(sketchGeneratedAt.getTime() + releaseDelayMinutes * 60 * 1000);

    const stepData = {
      ...req.body, // Include everything from the request
      answers,
      birthDetails,
      email,
      timestamp: new Date().toISOString(),
      sketchGenerated: true,
      sketchGeneratedAt: sketchGeneratedAt.toISOString(),
      sketchReleaseAt: sketchReleaseAt.toISOString(),
      sketchReleaseDelayMinutes: releaseDelayMinutes,
      promisedWindowHours,
      twinFlameEmailSent: false,
      twinFlameEmailScheduled: true,
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

    // Fire-and-forget: also generate horoscope for this user (if we created/found signup)
    if (userSignup?.id) {
      generateDailyHoroscope(userSignup.id)
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[Generate] Horoscope pre-generation skipped:', err?.message || err);
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




