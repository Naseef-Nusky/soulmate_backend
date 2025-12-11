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

  try {
    const session = await stripe.checkout.sessions.create(sessionOptions);

    if (!session) {
      console.error('[Stripe] ❌ Checkout session creation returned null/undefined');
      throw new Error('Stripe returned null session. Please check your Stripe configuration.');
    }

    if (!session.id) {
      console.error('[Stripe] ❌ Checkout session missing ID:', session);
      throw new Error('Checkout session missing ID. Please contact support.');
    }

    if (!session.url) {
      console.error('[Stripe] ❌ Checkout session created but missing URL:', {
        sessionId: session.id,
        sessionMode: session.mode,
        sessionStatus: session.status,
        hasUrl: !!session.url,
        sessionKeys: Object.keys(session),
      });
      throw new Error('Failed to create checkout session URL. Please try again.');
    }

    // Validate URL format
    if (!session.url.startsWith('https://checkout.stripe.com/')) {
      console.error('[Stripe] ❌ Invalid checkout URL format:', {
        sessionId: session.id,
        url: session.url.substring(0, 100),
      });
      throw new Error('Invalid checkout URL format. Please contact support.');
    }

    console.log('[Stripe] ✅ Checkout session created successfully:', {
      sessionId: session.id,
      urlLength: session.url.length,
      urlPreview: session.url.substring(0, 80) + '...',
      mode: session.mode,
      customer: session.customer || 'will be created',
      paymentStatus: session.payment_status,
    });

    return session;
  } catch (error) {
    // Enhanced error logging
    console.error('[Stripe] ❌ Failed to create checkout session:', {
      errorMessage: error.message,
      errorType: error.type,
      errorCode: error.code,
      errorStatus: error.statusCode,
      email: normalizedEmail,
      oneTimePriceId,
      hasSuccessUrl: !!successUrl,
      hasCancelUrl: !!cancelUrl,
      timestamp: new Date().toISOString(),
    });

    // Provide more specific error messages
    if (error.type === 'StripeInvalidRequestError') {
      if (error.message?.includes('price')) {
        throw new Error(`Invalid price configuration: ${error.message}. Please check STRIPE_TRIAL_ONE_TIME_PRICE_ID.`);
      }
      if (error.message?.includes('customer')) {
        throw new Error(`Customer creation failed: ${error.message}`);
      }
    }

    if (error.type === 'StripeAPIError') {
      throw new Error(`Stripe API error: ${error.message}. Please try again in a moment.`);
    }

    throw error;
  }
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
