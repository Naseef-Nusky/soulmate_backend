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

/**
 * Create a subscription with custom payment UI
 * Returns subscription with client_secret for payment confirmation
 */
export async function createSubscriptionWithPayment({
  email,
  name,
  birthDate,
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
    nextPriceId: monthlyPriceId,
    signupCreated: 'false',
  };

  // Create or retrieve customer
  let customer;
  const existingCustomers = await stripe.customers.list({
    email: normalizedEmail,
    limit: 1,
  });

  if (existingCustomers.data.length > 0) {
    customer = existingCustomers.data[0];
  } else {
    customer = await stripe.customers.create({
      email: normalizedEmail,
      name: name || undefined,
      metadata: {
        email: normalizedEmail,
        name: name || '',
        birthDate: birthDate || '',
      },
    });
  }

  // Create subscription with incomplete payment
  // Note: google_pay and apple_pay are not valid payment_method_types for subscriptions
  // They are handled automatically by the Payment Element's wallet configuration
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: trialPriceId }],
    payment_behavior: 'default_incomplete',
    payment_settings: {
      payment_method_types: ['card', 'link'],
      save_default_payment_method: 'on_subscription',
    },
    expand: ['latest_invoice.payment_intent', 'latest_invoice'],
    metadata,
  });

  // Get client secret from the payment intent
  const invoice = subscription.latest_invoice;
  let paymentIntent = invoice?.payment_intent;
  
  // If payment intent is a string ID, retrieve it with expansion
  if (typeof paymentIntent === 'string') {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntent);
  }

  // Ensure we have a payment intent
  if (!paymentIntent) {
    throw new Error('No payment intent found for subscription');
  }

  const clientSecret = paymentIntent?.client_secret;

  if (!clientSecret) {
    throw new Error('Failed to get client secret from payment intent');
  }

  console.log('[Stripe] Created subscription with payment intent:', {
    subscriptionId: subscription.id,
    paymentIntentId: paymentIntent.id,
    paymentIntentStatus: paymentIntent.status,
    hasClientSecret: !!clientSecret,
  });

  return {
    subscriptionId: subscription.id,
    clientSecret,
    customerId: customer.id,
  };
}