import express from 'express';
import { getStripe } from '../services/stripe.js';
import { getPool } from '../services/db.js';
import { findSignupByEmail, deactivateSignupByEmail } from '../services/auth.js';
import { sendCancellationConfirmationEmail } from '../services/email.js';

const router = express.Router();

// NOTE: These admin routes are currently unauthenticated.
// In production, you MUST protect them (e.g. with an API key or auth middleware).

// List all customers (signups)
router.get('/customers', async (_req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { rows } = await pool.query(
      `SELECT id, email, name, gender, place_of_birth, birth_date, birth_time,
              relationship_status, is_active, is_test, deactivated_at, created_at, updated_at
       FROM signups
       ORDER BY created_at DESC`
    );

    return res.json({ ok: true, customers: rows });
  } catch (error) {
    console.error('[Admin] Failed to list customers:', error);
    return res.status(500).json({ error: 'Failed to list customers' });
  }
});

// Admin: deactivate account immediately (without touching Stripe subscription)
router.post('/customers/deactivate', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await findSignupByEmail(normalizedEmail);
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    await deactivateSignupByEmail(normalizedEmail);

    return res.json({ ok: true, message: 'Account deactivated' });
  } catch (error) {
    console.error('[Admin] Failed to deactivate account:', error);
    return res.status(500).json({ error: 'Failed to deactivate account' });
  }
});

// Admin: cancel active subscription (mark cancel_at_period_end) for a user by email
router.post('/customers/cancel-subscription', async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user
    const signup = await findSignupByEmail(normalizedEmail);
    if (!signup) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get Stripe customer and subscription
    const stripe = getStripe();
    let customer = null;
    let subscription = null;
    let periodEndDate = null;

    try {
      const customers = await stripe.customers.list({
        email: normalizedEmail,
        limit: 1,
      });

      if (customers.data.length > 0) {
        customer = customers.data[0];

        const subscriptions = await stripe.subscriptions.list({
          customer: customer.id,
          status: 'active',
          limit: 1,
        });

        if (subscriptions.data.length > 0) {
          subscription = subscriptions.data[0];
          periodEndDate = new Date(subscription.current_period_end * 1000).toISOString();

          await stripe.subscriptions.update(subscription.id, {
            cancel_at_period_end: true,
          });

          console.log(`[Admin] Subscription ${subscription.id} marked for cancellation at period end (admin request)`);
        } else {
          return res.status(404).json({ error: 'No active subscription found for this account.' });
        }
      } else {
        return res.status(404).json({ error: 'No subscription found for this account.' });
      }
    } catch (stripeError) {
      console.error('[Admin] Stripe error during cancellation:', stripeError);
      return res.status(500).json({ error: 'Failed to cancel subscription via Stripe.' });
    }

    // Send cancellation confirmation email (reusing existing template)
    try {
      await sendCancellationConfirmationEmail({
        to: normalizedEmail,
        name: signup.name,
        periodEndDate,
      });
    } catch (emailError) {
      console.error('[Admin] Failed to send cancellation confirmation email:', emailError);
      // Don't fail the request if email fails
    }

    return res.json({
      ok: true,
      message: 'Subscription cancellation scheduled at period end.',
      subscription: {
        cancelAtPeriodEnd: true,
        periodEndDate,
      },
    });
  } catch (error) {
    console.error('[Admin] Cancel subscription error:', error);
    return res.status(500).json({ error: error.message || 'Failed to cancel subscription' });
  }
});

// Admin: detailed view for a single customer including subscription/payment (by email)
router.get('/customers/:email', async (req, res) => {
  try {
    const emailParam = req.params.email;
    const normalizedEmail = emailParam?.trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const signup = await findSignupByEmail(normalizedEmail);
    if (!signup) {
      return res.status(404).json({ error: 'User not found' });
    }

    const stripe = getStripe();

    let subscriptionData = {
      hasSubscription: false,
      subscription: null,
      paymentMethod: null,
      invoices: [],
    };

    try {
      const customers = await stripe.customers.list({
        email: normalizedEmail,
        limit: 1,
      });

      if (customers.data.length > 0) {
        const customer = customers.data[0];

        // Get all subscriptions for this customer
        const subscriptions = await stripe.subscriptions.list({
          customer: customer.id,
          status: 'all',
          limit: 10,
        });

        if (subscriptions.data.length > 0) {
          const activeSubscription =
            subscriptions.data.find((sub) => sub.status === 'active') ||
            subscriptions.data[0];

          // Get payment method
          let paymentMethod = null;
          if (activeSubscription.default_payment_method) {
            try {
              const pm = await stripe.paymentMethods.retrieve(
                activeSubscription.default_payment_method
              );
              paymentMethod = {
                type: pm.type,
                card: pm.card
                  ? {
                      brand: pm.card.brand,
                      last4: pm.card.last4,
                      expMonth: pm.card.exp_month,
                      expYear: pm.card.exp_year,
                    }
                  : null,
              };
            } catch (err) {
              console.error('[Admin] Failed to retrieve payment method:', err);
            }
          }

          const invoices = await stripe.invoices.list({
            customer: customer.id,
            limit: 5,
          });

          subscriptionData = {
            hasSubscription: true,
            subscription: {
              id: activeSubscription.id,
              status: activeSubscription.status,
              currentPeriodStart: new Date(
                activeSubscription.current_period_start * 1000
              ).toISOString(),
              currentPeriodEnd: new Date(
                activeSubscription.current_period_end * 1000
              ).toISOString(),
              cancelAtPeriodEnd: activeSubscription.cancel_at_period_end,
              canceledAt: activeSubscription.canceled_at
                ? new Date(activeSubscription.canceled_at * 1000).toISOString()
                : null,
              items: activeSubscription.items.data.map((item) => ({
                id: item.id,
                priceId: item.price.id,
                amount: item.price.unit_amount / 100,
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
            invoices: invoices.data.map((inv) => ({
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
        }
      }
    } catch (err) {
      console.error('[Admin] Failed to load subscription details:', err);
    }

    return res.json({
      ok: true,
      customer: signup,
      subscription: subscriptionData,
    });
  } catch (error) {
    console.error('[Admin] Get customer detail error:', error);
    return res.status(500).json({ error: 'Failed to load customer detail' });
  }
});

export default router;


