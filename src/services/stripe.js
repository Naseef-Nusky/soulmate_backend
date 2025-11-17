import Stripe from 'stripe';

let stripeInstance;

function ensureStripe() {
  if (!stripeInstance) {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    stripeInstance = new Stripe(secret, {
      apiVersion: '2024-06-20',
    });
  }
  return stripeInstance;
}

export function getStripe() {
  return ensureStripe();
}

export async function createTrialPaymentIntent({
  amount,
  currency,
  email,
  name,
  birthDate,
}) {
  const stripe = ensureStripe();
  return stripe.paymentIntents.create({
    amount,
    currency: currency.toLowerCase(),
    description: 'GuruLink 7-day trial',
    automatic_payment_methods: { enabled: true },
    receipt_email: email,
    metadata: {
      email: email?.trim().toLowerCase() || '',
      name: name || '',
      birthDate: birthDate || '',
    },
  });
}

export async function retrievePaymentIntent(paymentIntentId) {
  const stripe = ensureStripe();
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

export async function markSignupCreated(paymentIntentId) {
  const stripe = ensureStripe();
  try {
    const current = await stripe.paymentIntents.retrieve(paymentIntentId);
    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: {
        ...current.metadata,
        signupCreated: 'true',
      },
    });
  } catch (error) {
    console.warn('[Stripe] Unable to mark payment intent as used:', error?.message || error);
  }
}


