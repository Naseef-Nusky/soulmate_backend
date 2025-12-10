import express from 'express';
import { createCheckoutSession } from '../services/stripe.js';
import { saveResult } from '../services/db.js';
import { calculateAstrology } from '../services/astrology.js';

const router = express.Router();

/**
 * Create a Stripe Checkout Session for one-time trial payment ($1.00)
 * After payment succeeds, subscription will be created via webhook
 * Also saves quiz data to database before payment
 */
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { email, name, birthDate, quizData, currency, country } = req.body || {};
    
    // Detect mobile user agent for better logging
    const userAgent = req.headers['user-agent'] || '';
    const isMobile = /iPhone|iPad|iPod|Android/i.test(userAgent);
    
    console.log('[Payments] Checkout session request received:', {
      email,
      hasName: !!name,
      hasBirthDate: !!birthDate,
      currency,
      country,
      hasQuizData: !!quizData,
      quizDataKeys: quizData ? Object.keys(quizData) : [],
      hasAnswers: !!quizData?.answers,
      answerKeys: quizData?.answers ? Object.keys(quizData.answers) : [],
      answerCount: quizData?.answers ? Object.keys(quizData.answers).length : 0,
      isMobile,
      userAgent: userAgent.substring(0, 100), // Log first 100 chars
    });

    if (!email) {
      return res.status(400).json({ error: 'Email is required to start payment.' });
    }

    const cleanedEmail = email.trim().toLowerCase();

    // Save quiz data to database before payment (if provided)
    if (quizData && quizData.answers && Object.keys(quizData.answers).length > 0) {
      try {
        console.log(`[Payments] Saving quiz data to database for ${cleanedEmail} before payment...`);
        
        const birthDetails = quizData.birthDetails || {
          date: quizData.answers.birthDate || null,
          time: quizData.answers.birthTime || null,
          city: quizData.answers.birthCity || null,
        };
        
        const astrology = calculateAstrology(birthDetails);
        
        await saveResult({
          report: '',
          imageUrl: null,
          imageData: null,
          astrology,
          answers: quizData.answers,
          email: cleanedEmail, // Use the email from payment form
          stepData: {
            ...quizData,
            email: cleanedEmail, // Ensure email is set in stepData too
            savedBeforePayment: true,
            timestamp: new Date().toISOString(),
          },
        });
        
        console.log(`[Payments] ✅ Quiz data saved to database for ${cleanedEmail} before payment`);
      } catch (saveError) {
        console.error(`[Payments] Failed to save quiz data before payment:`, saveError?.message || saveError);
        // Continue with checkout even if quiz save fails
      }
    } else {
      console.warn(`[Payments] ⚠️ No quiz data provided for ${cleanedEmail}`);
      console.warn(`[Payments] Quiz data structure:`, quizData ? JSON.stringify(quizData).substring(0, 200) : 'null');
      console.warn(`[Payments] Proceeding with checkout anyway - quiz data should be saved when quiz is completed`);
    }

    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    // Redirect directly to login page after payment success
    // Generation will happen automatically via webhook
    // Ensure URLs use HTTPS for production (Stripe requires HTTPS)
    const isProduction = process.env.NODE_ENV === 'production';
    const baseUrl = isProduction && !appUrl.startsWith('https://') 
      ? appUrl.replace('http://', 'https://') 
      : appUrl;
    
    const successUrl = `${baseUrl}/login?session_id={CHECKOUT_SESSION_ID}&payment=success`;
    const cancelUrl = `${baseUrl}/quiz`;

    console.log('[Payments] Creating Stripe checkout session:', {
      email: cleanedEmail,
      successUrl,
      cancelUrl,
      isMobile,
    });

    const session = await createCheckoutSession({
      email: cleanedEmail,
      name,
      birthDate,
      successUrl,
      cancelUrl,
      currency,
      country,
    });

    console.log('[Payments] ✅ Checkout session created:', {
      sessionId: session.id,
      hasUrl: !!session.url,
      urlLength: session.url?.length,
      isMobile,
    });

    return res.json({
      ok: true,
      sessionId: session.id,
      url: session.url, // Redirect user to this URL
    });
  } catch (error) {
    console.error('[Payments] Failed to create checkout session:', error);
    if (error.message?.includes('STRIPE_SECRET_KEY') || error.message?.includes('STRIPE_PRICE_ID')) {
      return res.status(500).json({ error: 'Stripe is not configured on the server.' });
    }
    return res.status(500).json({ error: 'Unable to start payment. Please try again.' });
  }
});

// Keep the old endpoint for backward compatibility (if needed)
router.post('/create-intent', async (req, res) => {
  return res.status(400).json({ 
    error: 'This endpoint is deprecated. Please use /create-checkout-session instead.' 
  });
});

export default router;


