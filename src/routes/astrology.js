import express from 'express';
import { verifyToken } from '../services/auth.js';
import { 
  generateNatalChartReport, 
  generateDailyHoroscope,
  generateTomorrowHoroscope,
  generateMonthlyHoroscope
} from '../services/astrology.js';
import { getResultsByEmail, updateResultSpeedOption } from '../services/db.js';

const router = express.Router();

// Middleware to verify authentication
async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = await verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  next();
}

router.use(authenticate);

router.get('/natal-chart', async (req, res) => {
  try {
    const result = await generateNatalChartReport(req.user.id);
    res.json(result);
  } catch (error) {
    if (error?.code === 'QUIZ_INCOMPLETE' || error?.message === 'QUIZ_INCOMPLETE') {
      return res.status(403).json({
        error: 'Complete the soulmate quiz to unlock your core personality insights.',
        requiresQuiz: true,
      });
    }
    console.error('[Astrology] Natal chart error:', error);
    res.status(500).json({ error: 'Failed to generate natal chart report' });
  }
});

router.get('/horoscope', async (req, res) => {
  try {
    const { type = 'today' } = req.query;
    let horoscope;
    
    if (type === 'tomorrow') {
      horoscope = await generateTomorrowHoroscope(req.user.id);
    } else if (type === 'monthly' || type === 'month') {
      horoscope = await generateMonthlyHoroscope(req.user.id);
    } else {
      horoscope = await generateDailyHoroscope(req.user.id);
    }
    
    res.json(horoscope);
  } catch (error) {
    if (error?.code === 'QUIZ_INCOMPLETE' || error?.message === 'QUIZ_INCOMPLETE') {
      return res.status(403).json({
        error: 'Complete the soulmate quiz to unlock your horoscope.',
        requiresQuiz: true,
      });
    }
    console.error('[Astrology] Horoscope error:', error);
    res.status(500).json({ error: 'Failed to generate horoscope' });
  }
});

router.get('/horoscope/tomorrow', async (req, res) => {
  try {
    const horoscope = await generateTomorrowHoroscope(req.user.id);
    res.json(horoscope);
  } catch (error) {
    if (error?.code === 'QUIZ_INCOMPLETE' || error?.message === 'QUIZ_INCOMPLETE') {
      return res.status(403).json({
        error: 'Complete the soulmate quiz to unlock your horoscope.',
        requiresQuiz: true,
      });
    }
    console.error('[Astrology] Tomorrow horoscope error:', error);
    res.status(500).json({ error: 'Failed to generate tomorrow horoscope' });
  }
});

router.get('/horoscope/monthly', async (req, res) => {
  try {
    const horoscope = await generateMonthlyHoroscope(req.user.id);
    res.json(horoscope);
  } catch (error) {
    if (error?.code === 'QUIZ_INCOMPLETE' || error?.message === 'QUIZ_INCOMPLETE') {
      return res.status(403).json({
        error: 'Complete the soulmate quiz to unlock your horoscope.',
        requiresQuiz: true,
      });
    }
    console.error('[Astrology] Monthly horoscope error:', error);
    res.status(500).json({ error: 'Failed to generate monthly horoscope' });
  }
});

router.get('/soulmate-sketch', async (req, res) => {
  try {
    const userEmail = req.user.email;
    const results = await getResultsByEmail(userEmail);
    
    if (!results || results.length === 0) {
      return res.json({ 
        hasSketch: false,
        message: 'No soulmate sketch found. Complete the quiz to generate your sketch.'
      });
    }
    
    // Get the most recent result with an image or step data
    const latestResult = results.find(r => r.image_url || r.image_data) || results[0];
    const stepData = latestResult.step_data || {};
    const releaseDelayMinutes = Number(stepData.sketchReleaseDelayMinutes || process.env.SKETCH_RELEASE_DELAY_MINUTES || 600);
    const promisedWindowHours = Number(stepData.promisedWindowHours || process.env.SKETCH_PROMISED_HOURS || 24);
    const releaseAtIso = stepData.sketchReleaseAt || null;
    const releaseAt = releaseAtIso ? new Date(releaseAtIso) : null;
    const now = new Date();
    const isReady = !releaseAt || now >= releaseAt;
    const timeRemainingMs = releaseAt && now < releaseAt ? Math.max(0, releaseAt.getTime() - now.getTime()) : 0;
    
    // Build image URL - only reveal when ready
    let imageUrl = null;
    if (isReady) {
      imageUrl = latestResult.image_url;
      if (!imageUrl && latestResult.id) {
        const apiBase = (
          process.env.BACKEND_PUBLIC_URL
          || process.env.API_PUBLIC_URL
          || `http://localhost:${process.env.PORT || 4000}`
        ).replace(/\/$/, '');
        imageUrl = `${apiBase}/api/images/${latestResult.id}`;
      }
    }
    
    res.json({
      hasSketch: Boolean(latestResult),
      imageUrl,
      astrology: isReady ? latestResult.astrology : null,
      createdAt: latestResult.created_at,
      id: latestResult.id,
      isReady,
      readyAt: releaseAtIso,
      timingOption: 'standard',
      needsPayment: false,
      timeRemainingMs,
      releaseDelayMinutes,
      promisedWindowHours,
      sketchGeneratedAt: stepData.sketchGeneratedAt || null,
    });
  } catch (error) {
    console.error('[Astrology] Soulmate sketch error:', error);
    res.status(500).json({ error: 'Failed to get soulmate sketch' });
  }
});

// Update speed option for soulmate sketch
router.post('/soulmate-sketch/speed-option', async (req, res) => {
  try {
    const { speedOption } = req.body;
    if (!speedOption || !['standard', 'speed', 'express'].includes(speedOption)) {
      return res.status(400).json({ error: 'Invalid speed option' });
    }
    
    const userEmail = req.user.email;
    const results = await getResultsByEmail(userEmail);
    
    if (!results || results.length === 0) {
      return res.status(404).json({ error: 'No result found' });
    }
    
    // Get the most recent result
    const latestResult = results[0];
    
    // Update speed option
    const updated = await updateResultSpeedOption(latestResult.id, speedOption);
    
    if (!updated) {
      return res.status(500).json({ error: 'Failed to update speed option' });
    }
    
    // Return updated timing info
    const stepData = updated.step_data || {};
    const readyAt = stepData.readyAt ? new Date(stepData.readyAt) : null;
    const now = new Date();
    const timeRemaining = readyAt && !(now >= readyAt) ? Math.max(0, readyAt.getTime() - now.getTime()) : 0;
    
    res.json({
      success: true,
      timingOption: stepData.timingOption,
      readyAt: stepData.readyAt,
      timeRemaining,
      needsPayment: speedOption === 'speed' && !stepData.paymentConfirmed,
    });
  } catch (error) {
    console.error('[Astrology] Speed option update error:', error);
    res.status(500).json({ error: 'Failed to update speed option' });
  }
});

export default router;


