import 'dotenv/config';
// For DigitalOcean PostgreSQL: disable strict TLS certificate verification
// This is safe because we're connecting to a trusted DigitalOcean service
if (process.env.DATABASE_URL?.includes('ondigitalocean.com')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import generateRouter from './routes/generate.js';
import requestRouter from './routes/request.js';
import artistRouter from './routes/artist.js';
import imagesRouter from './routes/images.js';
import exportRouter from './routes/export.js';
import authRouter from './routes/auth.js';
import paymentsRouter from './routes/payments.js';
import astrologyRouter from './routes/astrology.js';
import translateRouter from './routes/translate.js';
import notificationsRouter from './routes/notifications.js';
import { initDb } from './services/db.js';
import { startQueue } from './services/queue.js';
import { provisionSignupAndSendLogin, ensurePostPaymentGeneration } from './services/onboarding.js';

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 4000;
const ORIGIN = process.env.APP_URL || '*';

app.use(cors({ origin: ORIGIN }));

// Stripe webhook endpoint (must be before express.json() middleware for raw body)
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const { getStripe } = await import('./services/stripe.js');
  const stripe = getStripe();
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('[Webhook] STRIPE_WEBHOOK_SECRET not configured, skipping verification');
    return res.status(400).send('Webhook secret not configured');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      console.log('[Webhook] Checkout session completed:', session.id);
      
      if (session.mode === 'subscription' && session.subscription) {
        try {
          const subscriptionId = session.subscription;
          const existingSubscription = await stripe.subscriptions.retrieve(subscriptionId);
          const existingMetadata = existingSubscription.metadata || {};
          
          const emailFromSession = session.customer_details?.email
            || session.metadata?.email
            || existingMetadata.email
            || '';
          const nameFromSession = session.metadata?.name || existingMetadata.name || '';
          const birthDateFromSession = session.metadata?.birthDate || existingMetadata.birthDate || '';
          const isPaidTrial = session.metadata?.type === 'paid_trial';
          let signupCreated = existingMetadata.signupCreated === 'true';
          
          if (!signupCreated && session.payment_status === 'paid' && isPaidTrial && emailFromSession) {
            try {
              await provisionSignupAndSendLogin({
                email: emailFromSession,
                name: nameFromSession,
                birthDate: birthDateFromSession,
              });
              signupCreated = true;
              console.log('[Webhook] Signup provisioned automatically for email:', emailFromSession);
            } catch (provisionError) {
              console.error('[Webhook] Failed to auto-provision signup:', provisionError?.message || provisionError);
            }
          }

          // After payment succeeds, generate everything immediately using quiz data
          if (isPaidTrial && emailFromSession && signupCreated) {
            console.log(`[Webhook] 🚀 Starting immediate generation after payment for ${emailFromSession}`);
            
            // Run generation in background (non-blocking)
            (async () => {
              try {
                const { getLatestResultByEmail } = await import('./services/db.js');
                const { saveResult } = await import('./services/db.js');
                const { calculateAstrology } = await import('./services/astrology.js');
                const { generatePencilSketchFromAnswers } = await import('./services/openai.js');
                const { uploadPngToSpaces } = await import('./services/storage.js');
                const {
                  generateDailyHoroscope,
                  generateTomorrowHoroscope,
                  generateMonthlyHoroscope,
                  generateNatalChartReport,
                } = await import('./services/astrology.js');
                const { findSignupByEmail } = await import('./services/auth.js');
                
                // Get signup to get user ID
                const signup = await findSignupByEmail(emailFromSession);
                if (!signup) {
                  console.warn(`[Webhook] Signup not found for ${emailFromSession}, skipping generation`);
                  return;
                }
                
                // Get quiz data from database
                const latestResult = await getLatestResultByEmail(emailFromSession);
                if (!latestResult || !latestResult.answers) {
                  console.warn(`[Webhook] ⚠️ No quiz data found for ${emailFromSession}. Quiz must be completed first.`);
                  return;
                }
                
                const stepData = latestResult.step_data || {};
                const answers = stepData.answers || latestResult.answers || {};
                const birthDetails = stepData.birthDetails || {
                  date: answers.birthDate || stepData.birthDate || null,
                  time: answers.birthTime || stepData.birthTime || null,
                  city: answers.birthCity || stepData.birthCity || null,
                };
                
                console.log(`[Webhook] ✅ Found quiz data for ${emailFromSession}, starting generation...`);
                
                const astrology = calculateAstrology(birthDetails);
                
                // Generate sketch immediately
                console.log(`[Webhook] Generating sketch for ${emailFromSession}...`);
                let image;
                try {
                  image = await generatePencilSketchFromAnswers(answers, astrology);
                  console.log(`[Webhook] ✅ Sketch generated for ${emailFromSession}`);
                } catch (sketchError) {
                  console.error(`[Webhook] ❌ Sketch generation failed:`, sketchError?.message || sketchError);
                  image = null;
                }
                
                // Upload sketch to Spaces if we have image data
                let spacesUrl = null;
                if (image?.imageData) {
                  try {
                    const objectKey = `sketch-${Date.now()}-${signup.id}.png`;
                    spacesUrl = await uploadPngToSpaces({ key: objectKey, dataBase64: image.imageData });
                    console.log(`[Webhook] ✅ Sketch uploaded to Spaces`);
                  } catch (uploadError) {
                    console.error('[Webhook] Failed to upload sketch:', uploadError?.message || uploadError);
                  }
                }
                
                // Update existing result with generated sketch
                if (latestResult?.id && image && (spacesUrl || image.imageData)) {
                  try {
                    const { updateResult } = await import('./services/db.js');
                    await updateResult(latestResult.id, {
                      imageUrl: spacesUrl || image?.url || null,
                      imageData: spacesUrl ? null : (image?.imageData || null),
                      stepData: {
                        ...stepData,
                        answers,
                        birthDetails,
                        email: emailFromSession,
                        generatedAfterPayment: true,
                        sketchGenerated: true,
                        timestamp: new Date().toISOString(),
                      },
                    });
                    console.log(`[Webhook] ✅ Sketch updated in database (result ID: ${latestResult.id})`);
                  } catch (updateError) {
                    console.error(`[Webhook] Failed to update with sketch:`, updateError?.message || updateError);
                  }
                } else if (image && (spacesUrl || image.imageData)) {
                  // If no existing result, create new one
                  try {
                    await saveResult({
                      report: '',
                      imageUrl: spacesUrl || image?.url || null,
                      imageData: spacesUrl ? null : (image?.imageData || null),
                      astrology,
                      answers,
                      email: emailFromSession,
                      stepData: {
                        ...stepData,
                        answers,
                        birthDetails,
                        email: emailFromSession,
                        generatedAfterPayment: true,
                        sketchGenerated: true,
                        timestamp: new Date().toISOString(),
                      },
                    });
                    console.log(`[Webhook] ✅ Quiz data and sketch saved to database`);
                  } catch (saveError) {
                    console.error(`[Webhook] Failed to save sketch:`, saveError?.message || saveError);
                  }
                }
                
                // Wait a moment to ensure database is updated
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Generate all horoscopes immediately
                console.log(`[Webhook] Starting horoscope generation for ${emailFromSession}...`);
                try {
                  await generateDailyHoroscope(signup.id);
                  console.log(`[Webhook] ✅ Daily horoscope generated`);
                } catch (err) {
                  console.error(`[Webhook] Daily horoscope failed:`, err?.message || err);
                }
                
                try {
                  await generateTomorrowHoroscope(signup.id);
                  console.log(`[Webhook] ✅ Tomorrow horoscope generated`);
                } catch (err) {
                  console.error(`[Webhook] Tomorrow horoscope failed:`, err?.message || err);
                }
                
                try {
                  await generateMonthlyHoroscope(signup.id);
                  console.log(`[Webhook] ✅ Monthly horoscope generated`);
                } catch (err) {
                  console.error(`[Webhook] Monthly horoscope failed:`, err?.message || err);
                }
                
                try {
                  await generateNatalChartReport(signup.id);
                  console.log(`[Webhook] ✅ Natal chart generated`);
                } catch (err) {
                  console.error(`[Webhook] Natal chart failed:`, err?.message || err);
                }
                
                console.log(`[Webhook] ✅ All generation completed for ${emailFromSession}`);
              } catch (genError) {
                console.error('[Webhook] ❌ Generation failed:', genError?.message || genError);
                console.error('[Webhook] Error stack:', genError?.stack);
              }
            })();
          }
          
          await stripe.subscriptions.update(subscriptionId, {
            metadata: {
              ...existingMetadata,
              email: emailFromSession,
              name: nameFromSession,
              birthDate: birthDateFromSession,
              signupCreated: signupCreated ? 'true' : (existingMetadata.signupCreated || 'false'),
              trialPaymentSessionId: session.id,
            },
          });
        } catch (error) {
          console.error('[Webhook] Error tagging subscription after checkout:', error.message || error);
        }
      }
      break;
    }
    
    case 'customer.subscription.created':
      const subscription = event.data.object;
      console.log('[Webhook] Subscription created:', subscription.id);
      // Subscription is created in checkout.session.completed webhook after trial payment
      break;
    
    case 'customer.subscription.trial_will_end':
      console.log('[Webhook] Trial ending soon for subscription:', event.data.object.id);
      // Trial ending in 3 days - monthly billing will start automatically
      // No action needed, Stripe handles subscription billing automatically
      break;
    
    case 'invoice.payment_succeeded':
      const invoice = event.data.object;
      console.log('[Webhook] Payment succeeded for invoice:', invoice.id);
      try {
        const subscriptionId = invoice.subscription;
        const trialPriceId = process.env.STRIPE_TRIAL_PRICE_ID;
        if (subscriptionId && trialPriceId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const nextPriceId = subscription.metadata?.nextPriceId;

          const invoiceHasTrialPrice = invoice.lines?.data?.some(
            (line) => line.price?.id === trialPriceId
          );

          if (nextPriceId && invoiceHasTrialPrice) {
            const currentItem = subscription.items?.data?.[0];
            if (currentItem) {
              await stripe.subscriptions.update(subscriptionId, {
                items: [
                  {
                    id: currentItem.id,
                    price: nextPriceId,
                  },
                ],
                proration_behavior: 'none',
              });

              await stripe.subscriptions.update(subscriptionId, {
                metadata: {
                  ...subscription.metadata,
                  nextPriceId: '',
                },
              });

              console.log('[Webhook] Subscription switched to monthly price:', subscriptionId);
            }
          }
        }
      } catch (error) {
        console.error('[Webhook] Error updating subscription price:', error.message || error);
      }
      break;
    
    case 'invoice.payment_failed':
      console.log('[Webhook] Payment failed for invoice:', event.data.object.id);
      // Payment failed - handle accordingly
      break;
    
    default:
      console.log(`[Webhook] Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

app.use(express.json({ limit: '2mb' }));

// Serve locally written images (fallback when DB/Spaces unavailable)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/generate', generateRouter);
app.use('/api/request', requestRouter);
app.use('/api/artist', artistRouter);
app.use('/api/images', imagesRouter);
app.use('/api/export', exportRouter);
app.use('/api/auth', authRouter);
app.use('/api/astrology', astrologyRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/translate', translateRouter);
app.use('/api/notifications', notificationsRouter);
// Note: No subscription routes mounted

server.listen(PORT, async () => {
  await initDb();
  // eslint-disable-next-line no-console
  console.log(`Backend running on http://localhost:${PORT}`);
  startQueue();
});


