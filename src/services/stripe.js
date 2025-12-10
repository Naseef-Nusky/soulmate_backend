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
  const oneTimePriceId = process.env.STRIPE_TRIAL_ONE_TIME_PRICE_ID;

  if (!oneTimePriceId) {
    throw new Error('STRIPE_TRIAL_ONE_TIME_PRICE_ID must be configured');
  }

  const normalizedEmail = email?.trim().toLowerCase();
  const metadata = {
    email: normalizedEmail || '',
    name: name || '',
    birthDate: birthDate || '',
    type: 'paid_trial',
  };

  // One-time payment. Monthly subscription will be created in webhook after payment.
  const sessionOptions = {
    mode: 'payment',
    payment_method_types: ['card', 'link'],
    customer_email: normalizedEmail,
    // Ensure a Customer is created/attached so webhook + auth can find it
    customer_creation: 'always',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    line_items: [
      {
        price: oneTimePriceId,
        quantity: 1,
      },
    ],
    // Add billing address collection for better mobile support
    billing_address_collection: 'auto',
    // Disable promotion codes to hide the promo box in hosted checkout
    allow_promotion_codes: false,
  };

  console.log('[Stripe] Creating checkout session with options:', {
    email: normalizedEmail,
    hasSuccessUrl: !!successUrl,
    hasCancelUrl: !!cancelUrl,
    oneTimePriceId,
    timestamp: new Date().toISOString(),
  });

  const session = await stripe.checkout.sessions.create(sessionOptions);

  if (!session || !session.url) {
    console.error('[Stripe] Checkout session created but missing URL:', {
      sessionId: session?.id,
      hasUrl: !!session?.url,
    });
    throw new Error('Failed to create checkout session URL');
  }

  console.log('[Stripe] ✅ Checkout session created successfully:', {
    sessionId: session.id,
    urlLength: session.url.length,
    urlPreview: session.url.substring(0, 80) + '...',
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
