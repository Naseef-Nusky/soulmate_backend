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

/**
 * Create a Stripe Checkout Session for the paid trial flow.
 * Phase 1: charge £1 immediately using STRIPE_TRIAL_PRICE_ID (recurring 7-day price)
 * Phase 2: webhook swaps to STRIPE_MONTHLY_PRICE_ID before the second billing cycle.
 */
export async function createCheckoutSession({
  email,
  name,
  birthDate,
  successUrl,
  cancelUrl,
}) {
  const stripe = ensureStripe();
  const trialPriceId = process.env.STRIPE_TRIAL_PRICE_ID;
  const monthlyPriceId = process.env.STRIPE_MONTHLY_PRICE_ID;

  if (!trialPriceId || !monthlyPriceId) {
    throw new Error('STRIPE_TRIAL_PRICE_ID and STRIPE_MONTHLY_PRICE_ID must be configured');
  }

  const normalizedEmail = email?.trim().toLowerCase();
  const metadata = {
    email: normalizedEmail || '',
    name: name || '',
    birthDate: birthDate || '',
    type: 'paid_trial',
  };

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card','link'],
    customer_email: normalizedEmail,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    line_items: [
      {
        price: trialPriceId,
        quantity: 1,
      },
    ],
    subscription_data: {
      metadata: {
        ...metadata,
        nextPriceId: monthlyPriceId,
        signupCreated: 'false',
      },
    },
  });

  return session;
}

/**
 * Retrieve a Checkout Session (expanded with subscription details)
 */
export async function retrieveCheckoutSession(sessionId) {
  const stripe = ensureStripe();
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription'],
  });
}

/**
 * Mark subscription metadata as signup created
 */
export async function markSubscriptionSignupCreated(subscriptionId) {
  const stripe = ensureStripe();
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await stripe.subscriptions.update(subscriptionId, {
      metadata: {
        ...subscription.metadata,
        signupCreated: 'true',
      },
    });
  } catch (error) {
    console.warn('[Stripe] Unable to mark subscription as used:', error?.message || error);
  }
}
