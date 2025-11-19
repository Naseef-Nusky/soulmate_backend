import express from 'express';
import { findSignupByEmail, generateToken, generateLoginToken, verifyLoginToken, updateProfile, getProfile, verifyToken } from '../services/auth.js';
import { sendLoginLinkEmail } from '../services/email.js';
import { generateDailyHoroscope, generateTomorrowHoroscope, generateMonthlyHoroscope, generateNatalChartReport } from '../services/astrology.js';
import { getStripe, retrieveCheckoutSession, markSubscriptionSignupCreated } from '../services/stripe.js';
import { provisionSignupAndSendLogin } from '../services/onboarding.js';

const router = express.Router();
const SKETCH_RELEASE_DELAY_MINUTES = Number(process.env.SKETCH_RELEASE_DELAY_MINUTES || 600);
const SKETCH_PROMISED_WINDOW_HOURS = Number(process.env.SKETCH_PROMISED_HOURS || 24);

router.post('/register', async (req, res) => {
  try {
    const { email, name, birthDate, sessionId, quizData } = req.body;
    
    console.log('[Auth] Registration request received:', {
      email,
      hasName: !!name,
      hasBirthDate: !!birthDate,
      hasSessionId: !!sessionId,
      hasQuizData: !!quizData,
      quizDataKeys: quizData ? Object.keys(quizData) : [],
      hasAnswers: !!quizData?.answers,
      answerKeys: quizData?.answers ? Object.keys(quizData.answers) : [],
      answerCount: quizData?.answers ? Object.keys(quizData.answers).length : 0,
      hasBirthDetails: !!quizData?.birthDetails,
      quizDataType: quizData ? typeof quizData : 'null',
      quizDataStringLength: quizData ? JSON.stringify(quizData).length : 0,
    });
    
    // Log first few answer keys for debugging
    if (quizData?.answers) {
      const answerKeys = Object.keys(quizData.answers);
      console.log('[Auth] First 10 answer keys:', answerKeys.slice(0, 10));
    }
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!sessionId) {
      return res.status(402).json({ error: 'Payment session is required before creating an account.' });
    }

    const cleanedEmail = email.trim().toLowerCase();
    let checkoutSession;
    try {
      checkoutSession = await retrieveCheckoutSession(sessionId);
    } catch (error) {
      console.error('[Auth] Unable to retrieve checkout session:', error);
      return res.status(402).json({ error: 'Unable to verify payment session. Please try again.' });
    }

    // Verify checkout session is completed and paid
    if (checkoutSession.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment has not been completed yet.' });
    }

    // Verify this is our trial subscription flow
    if (checkoutSession.mode !== 'subscription' || checkoutSession.metadata?.type !== 'paid_trial') {
      return res.status(400).json({ error: 'Invalid payment type.' });
    }

    const stripe = getStripe();
    let subscription = null;
    try {
      if (checkoutSession.subscription) {
        if (typeof checkoutSession.subscription === 'string') {
          subscription = await stripe.subscriptions.retrieve(checkoutSession.subscription);
        } else {
          subscription = checkoutSession.subscription;
        }
      }
    } catch (error) {
      console.error('[Auth] Error retrieving subscription:', error);
    }

    const sessionEmail = checkoutSession.customer_email || checkoutSession.metadata?.email;
    if (sessionEmail && sessionEmail.toLowerCase() !== cleanedEmail) {
      return res.status(400).json({ error: 'Payment email does not match registration email.' });
    }

    const { signup, token, loginLink, horoscope } = await provisionSignupAndSendLogin({
      email: cleanedEmail,
      name,
      birthDate,
      sendEmails: true,
    });
    
    // Normalize quiz data structure - handle different formats
    let finalQuizData = null;
    
    if (quizData) {
      // Try to extract answers from different possible structures
      let answers = quizData.answers;
      let birthDetails = quizData.birthDetails;
      
      // If answers is not directly in quizData, check if quizData itself is the answers
      if (!answers && typeof quizData === 'object') {
        // Check if quizData has quiz answer fields directly
        if (quizData.birthDate || quizData.gender || quizData.ageRange) {
          answers = { ...quizData };
          console.log('[Auth] Quiz data appears to be answers directly, extracting...');
        }
      }
      
      // Extract birth details if not present
      if (!birthDetails && answers) {
        birthDetails = {
          date: answers.birthDate || quizData.birthDate || null,
          time: answers.birthTime || quizData.birthTime || null,
          city: answers.birthCity || quizData.birthCity || null,
        };
      }
      
      if (answers && Object.keys(answers).length > 0) {
        finalQuizData = {
          answers,
          birthDetails,
          email: cleanedEmail,
          ...quizData,
        };
        console.log(`[Auth] ✅ Quiz data extracted from request: ${Object.keys(answers).length} answer fields`);
      } else {
        console.warn(`[Auth] ⚠️ Quiz data provided but no answers found. Structure:`, Object.keys(quizData || {}));
      }
    }
    
    // If still no quiz data, try to get it from database
    if (!finalQuizData || !finalQuizData.answers || Object.keys(finalQuizData.answers).length === 0) {
      console.log(`[Auth] Quiz data not usable from request, searching database for ${cleanedEmail}...`);
      try {
        const { getLatestResultByEmail } = await import('../services/db.js');
        const latestResult = await getLatestResultByEmail(cleanedEmail);
        if (latestResult) {
          const stepData = latestResult.step_data || {};
          const answers = stepData.answers || latestResult.answers || {};
          const birthDetails = stepData.birthDetails || {
            date: answers.birthDate || stepData.birthDate || null,
            time: answers.birthTime || stepData.birthTime || null,
            city: answers.birthCity || stepData.birthCity || null,
          };
          
          if (answers && Object.keys(answers).length > 0) {
            finalQuizData = {
              answers,
              birthDetails,
              email: cleanedEmail,
              ...stepData,
            };
            console.log(`[Auth] ✅ Found quiz data in database for ${cleanedEmail}: ${Object.keys(answers).length} answer fields`);
          } else {
            console.warn(`[Auth] ⚠️ Found result in database but no answers:`, latestResult.id);
          }
        } else {
          console.warn(`[Auth] ⚠️ No quiz data found in database for ${cleanedEmail}`);
        }
      } catch (dbError) {
        console.error(`[Auth] Error searching for quiz data:`, dbError?.message || dbError);
      }
    }
    
    // After signup is created, generate everything immediately using quiz data
    if (finalQuizData && finalQuizData.answers) {
      // Run generation in background (don't block response)
    (async () => {
        try {
          console.log(`[Auth] 🚀 Starting immediate generation for ${cleanedEmail} using quiz data`);
          console.log(`[Auth] Quiz data keys:`, Object.keys(finalQuizData));
          console.log(`[Auth] Quiz answers keys:`, finalQuizData.answers ? Object.keys(finalQuizData.answers) : 'no answers');
          
          const { saveResult } = await import('../services/db.js');
          const { calculateAstrology } = await import('../services/astrology.js');
          const { generatePencilSketchFromAnswers } = await import('../services/openai.js');
          const { uploadPngToSpaces } = await import('../services/storage.js');
          const {
            generateDailyHoroscope,
            generateTomorrowHoroscope,
            generateMonthlyHoroscope,
            generateNatalChartReport,
          } = await import('../services/astrology.js');
          
          const birthDetails = finalQuizData.birthDetails || {
            date: finalQuizData.answers.birthDate || null,
            time: finalQuizData.answers.birthTime || null,
            city: finalQuizData.answers.birthCity || null,
          };
          
          console.log(`[Auth] Birth details:`, birthDetails);
          
          if (!birthDetails.date) {
            console.warn(`[Auth] ⚠️ No birth date in quiz data for ${cleanedEmail}`);
          }
          
          const astrology = calculateAstrology(birthDetails);
          console.log(`[Auth] Astrology calculated:`, astrology?.sunSign || 'no sun sign');
          
          // STEP 1: Save ALL quiz data to database FIRST (before generation)
          // This ensures all localStorage data is persisted
          console.log(`[Auth] Step 1: Saving all quiz data to database for ${cleanedEmail}...`);
          let savedResult;
          try {
            savedResult = await saveResult({
              report: '',
              imageUrl: null, // Will be updated after sketch generation
              imageData: null, // Will be updated after sketch generation
              astrology,
              answers: finalQuizData.answers,
              email: cleanedEmail,
              stepData: {
                ...finalQuizData, // Include ALL data from localStorage
                answers: finalQuizData.answers,
                birthDetails,
                email: cleanedEmail,
                savedBeforeGeneration: true,
                timestamp: new Date().toISOString(),
              },
            });
            console.log(`[Auth] ✅ All quiz data saved to database (result ID: ${savedResult?.id})`);
            console.log(`[Auth] Saved ${Object.keys(finalQuizData.answers).length} answer fields to database`);
          } catch (saveError) {
            console.error(`[Auth] ❌ Failed to save quiz data:`, saveError?.message || saveError);
            throw saveError;
          }
          
          // Generate sketch immediately
          console.log(`[Auth] Generating sketch for ${cleanedEmail}...`);
          let image;
          try {
            image = await generatePencilSketchFromAnswers(finalQuizData.answers, astrology);
            console.log(`[Auth] ✅ Sketch generated for ${cleanedEmail}`, image?.url ? 'with URL' : image?.imageData ? 'with imageData' : 'no image');
          } catch (sketchError) {
            console.error(`[Auth] ❌ Sketch generation failed for ${cleanedEmail}:`, sketchError?.message || sketchError);
            image = null;
          }
          
          // Upload sketch to Spaces if we have image data
          let spacesUrl = null;
          if (image?.imageData) {
            try {
              const objectKey = `sketch-${Date.now()}-${signup.id}.png`;
              spacesUrl = await uploadPngToSpaces({ key: objectKey, dataBase64: image.imageData });
              console.log(`[Auth] ✅ Sketch uploaded to Spaces: ${spacesUrl}`);
            } catch (uploadError) {
              console.error('[Auth] Failed to upload sketch to Spaces:', uploadError?.message || uploadError);
            }
          }
          
          // STEP 2: Update existing record with generated sketch
          console.log(`[Auth] Step 2: Updating database with generated sketch for ${cleanedEmail}...`);
          const sketchGeneratedAt = new Date();
          const sketchReleaseAt = new Date(sketchGeneratedAt.getTime() + SKETCH_RELEASE_DELAY_MINUTES * 60 * 1000);
          const baseStepData = {
            ...finalQuizData,
            answers: finalQuizData.answers,
            birthDetails,
            email: cleanedEmail,
            savedBeforeGeneration: true,
            sketchGenerated: true,
            sketchGeneratedAt: sketchGeneratedAt.toISOString(),
            sketchReleaseAt: sketchReleaseAt.toISOString(),
            sketchReleaseDelayMinutes: SKETCH_RELEASE_DELAY_MINUTES,
            promisedWindowHours: SKETCH_PROMISED_WINDOW_HOURS,
            twinFlameEmailSent: false,
            twinFlameEmailScheduled: true,
          };
          try {
            const { updateResult } = await import('../services/db.js');
            if (savedResult?.id) {
              await updateResult(savedResult.id, {
                imageUrl: spacesUrl || image?.url || null,
                imageData: spacesUrl ? null : (image?.imageData || null),
                stepData: baseStepData,
              });
              console.log(`[Auth] ✅ Sketch updated in database (result ID: ${savedResult.id})`);
            } else {
              // If no existing record, create new one with sketch
              const newResult = await saveResult({
                report: '',
                imageUrl: spacesUrl || image?.url || null,
                imageData: spacesUrl ? null : (image?.imageData || null),
                astrology,
                answers: finalQuizData.answers,
                email: cleanedEmail,
                stepData: baseStepData,
              });
              console.log(`[Auth] ✅ Quiz data and sketch saved to database (result ID: ${newResult?.id})`);
            }
          } catch (updateError) {
            console.error(`[Auth] ❌ Failed to update with sketch:`, updateError?.message || updateError);
            // Continue even if update fails - data is already saved
          }
          
          // Wait a moment to ensure database transaction is committed
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Generate all horoscopes immediately
          console.log(`[Auth] Starting horoscope generation for ${cleanedEmail}...`);
          try {
            await generateDailyHoroscope(signup.id);
            console.log(`[Auth] ✅ Daily horoscope generated for ${cleanedEmail}`);
          } catch (err) {
            console.error(`[Auth] ❌ Daily horoscope generation failed for ${cleanedEmail}:`, err?.message || err);
            console.error(`[Auth] Error stack:`, err?.stack);
          }
          
          try {
            await generateTomorrowHoroscope(signup.id);
            console.log(`[Auth] ✅ Tomorrow horoscope generated for ${cleanedEmail}`);
          } catch (err) {
            console.error(`[Auth] ❌ Tomorrow horoscope generation failed for ${cleanedEmail}:`, err?.message || err);
          }
          
          try {
            await generateMonthlyHoroscope(signup.id);
            console.log(`[Auth] ✅ Monthly horoscope generated for ${cleanedEmail}`);
          } catch (err) {
            console.error(`[Auth] ❌ Monthly horoscope generation failed for ${cleanedEmail}:`, err?.message || err);
          }
          
          try {
            await generateNatalChartReport(signup.id);
            console.log(`[Auth] ✅ Natal chart generated for ${cleanedEmail}`);
          } catch (err) {
            console.error(`[Auth] ❌ Natal chart generation failed for ${cleanedEmail}:`, err?.message || err);
          }
          
          console.log(`[Auth] ✅ All generation tasks completed for ${cleanedEmail}`);
        } catch (genError) {
          console.error('[Auth] ❌ Failed to generate content:', genError?.message || genError);
          console.error('[Auth] Error stack:', genError?.stack);
          // Continue even if generation fails - user can still access account
        }
      })();
    } else {
      console.warn(`[Auth] ⚠️ No quiz data found for ${cleanedEmail} (not in request and not in database) - skipping generation`);
      console.warn(`[Auth] User must complete quiz before payment or quiz data must be saved with matching email`);
    }
    
    res.json({ 
      ok: true, 
      signup,
      token,
      loginLink, // Return link in response too (for testing)
      horoscope, // Include horoscope in response
      user: {
        id: signup.id,
        email: signup.email,
        name: signup.name,
        birthDate: signup.birth_date,
      }
    });

    // Mark subscription as signup created if subscription exists
    if (subscription?.id) {
      markSubscriptionSignupCreated(subscription.id).catch(() => {});
    }
  } catch (error) {
    console.error('[Auth] Registration error:', error);
    res.status(400).json({ error: error.message || 'Registration failed' });
  }
});

// Check if account exists by email
router.post('/check-account', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const signup = await findSignupByEmail(email);
    res.json({ exists: !!signup });
  } catch (error) {
    console.error('[Auth] Check account error:', error);
    res.status(500).json({ error: error.message || 'Failed to check account' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, token } = req.body;
    
    // If token provided, verify magic link
    if (token) {
      const emailFromToken = verifyLoginToken(token);
      if (!emailFromToken) {
        return res.status(401).json({ error: 'Invalid or expired login link' });
      }
      
      let signup = await findSignupByEmail(emailFromToken);
      if (!signup) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const authToken = generateToken(signup.email);
      
      // Best‑effort pre-generation
      let horoscope = null;
      try { horoscope = await generateDailyHoroscope(signup.id); } catch (_e) {}
      (async () => {
        try { await generateTomorrowHoroscope(signup.id); } catch (_e) {}
        try { await generateMonthlyHoroscope(signup.id); } catch (_e) {}
        try { await generateNatalChartReport(signup.id); } catch (_e) {}
      })();
      
      return res.json({ 
        ok: true, 
        signup,
        token: authToken,
        horoscope, // Include horoscope in response
        user: {
          id: signup.id,
          email: signup.email,
          name: signup.name,
          birthDate: signup.birth_date,
        }
      });
    }
    
    // Regular email login
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const signup = await findSignupByEmail(email);
    if (!signup) {
      return res.status(404).json({
        error: 'Please make sure you enter the email you used to create your GuruLink account.',
        requiresQuiz: true,
      });
    }

    // User exists, send login link
    const loginToken = generateLoginToken(signup.email);
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const loginLink = `${appUrl}/login?token=${loginToken}`;
    
    // Best‑effort pre-generation for user
    let horoscope = null;
    try { horoscope = await generateDailyHoroscope(signup.id); } catch (_e) {}
    (async () => {
      try { await generateTomorrowHoroscope(signup.id); } catch (_e) {}
      try { await generateMonthlyHoroscope(signup.id); } catch (_e) {}
      try { await generateNatalChartReport(signup.id); } catch (_e) {}
    })();
    
    try {
      await sendLoginLinkEmail({ 
        to: signup.email, 
        loginLink,
        name: signup.name 
      });
    } catch (emailError) {
      console.error('[Auth] Failed to send login email:', emailError);
    }
    
    res.json({ 
      ok: true, 
      message: 'Please check your email for login link.',
      signup,
      horoscope, // Include horoscope in response (will be shown after login)
      user: {
        id: signup.id,
        email: signup.email,
        name: signup.name,
        birthDate: signup.birth_date,
      }
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(400).json({ error: error.message || 'Login failed' });
  }
});

// Verify login token endpoint (for magic link)
router.get('/verify-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const email = verifyLoginToken(token);
    
    if (!email) {
      return res.status(401).json({ error: 'Invalid or expired login link' });
    }
    
    const signup = await findSignupByEmail(email);
    if (!signup) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const authToken = generateToken(signup.email);
    
    res.json({ 
      ok: true, 
      signup,
      token: authToken,
      user: {
        id: signup.id,
        email: signup.email,
        name: signup.name,
        birthDate: signup.birth_date,
      }
    });
  } catch (error) {
    console.error('[Auth] Token verification error:', error);
    res.status(400).json({ error: error.message || 'Token verification failed' });
  }
});

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

// Get user profile
router.get('/profile', authenticate, async (req, res) => {
  try {
    const profile = await getProfile(req.user.id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile);
  } catch (error) {
    console.error('[Auth] Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update user profile
router.put('/profile', authenticate, async (req, res) => {
  try {
    const profile = await updateProfile(req.user.id, req.body);
    res.json(profile);
  } catch (error) {
    console.error('[Auth] Update profile error:', error);
    res.status(500).json({ error: error.message || 'Failed to update profile' });
  }
});

// Get subscription/payment details
router.get('/subscription', authenticate, async (req, res) => {
  try {
    const userEmail = req.user.email;
    if (!userEmail) {
      return res.status(400).json({ error: 'User email not found' });
    }

    const stripe = getStripe();
    
    // Search for customers by email
    const customers = await stripe.customers.list({
      email: userEmail,
      limit: 1,
    });

    if (customers.data.length === 0) {
      return res.json({
        hasSubscription: false,
        message: 'No subscription found',
      });
    }

    const customer = customers.data[0];
    
    // Get all subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 10,
    });

    if (subscriptions.data.length === 0) {
      return res.json({
        hasSubscription: false,
        customerId: customer.id,
        message: 'No active subscription found',
      });
    }

    // Get the most recent active subscription, or the most recent one
    const activeSubscription = subscriptions.data.find(sub => sub.status === 'active') || subscriptions.data[0];
    
    // Get payment method
    let paymentMethod = null;
    if (activeSubscription.default_payment_method) {
      try {
        const pm = await stripe.paymentMethods.retrieve(activeSubscription.default_payment_method);
        paymentMethod = {
          type: pm.type,
          card: pm.card ? {
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year,
          } : null,
        };
      } catch (err) {
        console.error('[Auth] Failed to retrieve payment method:', err);
      }
    }

    // Get recent invoices
    const invoices = await stripe.invoices.list({
      customer: customer.id,
      limit: 5,
    });

    // Format subscription data
    const subscriptionData = {
      hasSubscription: true,
      subscription: {
        id: activeSubscription.id,
        status: activeSubscription.status,
        currentPeriodStart: new Date(activeSubscription.current_period_start * 1000).toISOString(),
        currentPeriodEnd: new Date(activeSubscription.current_period_end * 1000).toISOString(),
        cancelAtPeriodEnd: activeSubscription.cancel_at_period_end,
        canceledAt: activeSubscription.canceled_at ? new Date(activeSubscription.canceled_at * 1000).toISOString() : null,
        items: activeSubscription.items.data.map(item => ({
          id: item.id,
          priceId: item.price.id,
          amount: item.price.unit_amount / 100, // Convert from cents
          currency: item.price.currency,
          interval: item.price.recurring?.interval,
          intervalCount: item.price.recurring?.interval_count,
        })),
      },
      customer: {
        id: customer.id,
        email: customer.email,
      },
      paymentMethod,
      invoices: invoices.data.map(inv => ({
        id: inv.id,
        amount: inv.amount_paid / 100,
        currency: inv.currency,
        status: inv.status,
        paid: inv.paid,
        created: new Date(inv.created * 1000).toISOString(),
        hostedInvoiceUrl: inv.hosted_invoice_url,
        invoicePdf: inv.invoice_pdf,
      })),
    };

    res.json(subscriptionData);
  } catch (error) {
    console.error('[Auth] Get subscription error:', error);
    res.status(500).json({ error: error.message || 'Failed to get subscription details' });
  }
});

export default router;



