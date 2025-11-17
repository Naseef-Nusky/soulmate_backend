import express from 'express';
import { getPricing, toMinorUnit } from '../utils/pricing.js';
import { createTrialPaymentIntent } from '../services/stripe.js';

const router = express.Router();

router.post('/create-intent', async (req, res) => {
  try {
    const { email, name, birthDate, currency } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: 'Email is required to start payment.' });
    }

    const pricing = getPricing(currency);
    if (!pricing) {
      return res.status(400).json({ error: 'Unsupported currency' });
    }

    const amountInMinorUnits = toMinorUnit(pricing.trial.amount, pricing.currency);

    const paymentIntent = await createTrialPaymentIntent({
      amount: amountInMinorUnits,
      currency: pricing.currency,
      email,
      name,
      birthDate,
    });

    return res.json({
      ok: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      currency: pricing.currency,
      displayAmount: pricing.trial.formatted,
      amount: pricing.trial.amount,
    });
  } catch (error) {
    console.error('[Payments] Failed to create payment intent:', error);
    if (error.message?.includes('STRIPE_SECRET_KEY')) {
      return res.status(500).json({ error: 'Stripe is not configured on the server.' });
    }
    return res.status(500).json({ error: 'Unable to start payment. Please try again.' });
  }
});

export default router;


