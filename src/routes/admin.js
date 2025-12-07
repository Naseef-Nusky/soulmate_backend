import express from 'express';
import { getStripe } from '../services/stripe.js';
import { getPool } from '../services/db.js';
import { findSignupByEmail, deactivateSignupByEmail, activateSignupByEmail } from '../services/auth.js';
import { sendCancellationConfirmationEmail, sendAccountDeactivationEmail, sendAccountActivationEmail, sendSubscriptionReactivationEmail, sendEmail } from '../services/email.js';
import { createNotification } from '../services/notifications.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@gurulink.app';
import { requireAdminAuth, requireSuperAdmin, requireRole } from '../middleware/adminAuth.js';

const router = express.Router();

// Protect all admin routes with authentication
router.use(requireAdminAuth);

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

// Admin: deactivate account immediately (without touching Stripe subscription) - SUPER ADMIN AND ADMIN ONLY
router.post('/customers/deactivate', requireRole(['super_admin', 'admin']), async (req, res) => {
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

    // Send deactivation email to customer
    try {
      await sendAccountDeactivationEmail({
        to: normalizedEmail,
        name: existing.name,
      });
    } catch (emailError) {
      console.error('[Admin] Failed to send deactivation email:', emailError);
    }

    // Send notification to admin
    try {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: 'Account Deactivated',
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111; max-width: 600px; margin: 0 auto;">
            <h2 style="margin: 0 0 12px; font-size: 20px; color: #1A2336;">Account Deactivated</h2>
            <p style="margin: 0 0 8px;">An account has been deactivated.</p>
            <p style="margin: 0 0 4px;"><strong>Email:</strong> ${normalizedEmail}</p>
            ${existing.name ? `<p style="margin: 0 0 4px;"><strong>Name:</strong> ${existing.name}</p>` : ''}
            <p style="margin: 16px 0 0; font-size: 13px; color: #6B7280;">
              This is an automated notification sent to the GuruLink admin.
            </p>
          </div>
        `,
        categories: ['admin', 'deactivation'],
      });
    } catch (adminEmailError) {
      console.error('[Admin] Failed to send admin deactivation notification:', adminEmailError);
    }

    // Create CRM notification for account deactivation
    try {
      await createNotification({
        type: 'account_deactivated',
        title: 'Account Deactivated',
        message: existing.name
          ? `Account deactivated: ${existing.name} (${normalizedEmail})`
          : `Account deactivated: ${normalizedEmail}`,
        data: {
          email: normalizedEmail,
          name: existing.name || null,
          deactivatedBy: 'admin',
        },
      });
      console.log('[Admin] ✅ CRM notification created for account deactivation');
    } catch (notifError) {
      console.error('[Admin] Failed to create CRM notification for deactivation:', notifError);
    }

    return res.json({ ok: true, message: 'Account deactivated' });
  } catch (error) {
    console.error('[Admin] Failed to deactivate account:', error);
    return res.status(500).json({ error: 'Failed to deactivate account' });
  }
});

// Admin: activate account (reactivate a previously deactivated account) - SUPER ADMIN AND ADMIN ONLY
router.post('/customers/activate', requireRole(['super_admin', 'admin']), async (req, res) => {
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

    await activateSignupByEmail(normalizedEmail);

    // Send activation email to customer
    try {
      await sendAccountActivationEmail({
        to: normalizedEmail,
        name: existing.name,
      });
    } catch (emailError) {
      console.error('[Admin] Failed to send activation email:', emailError);
    }

    // Send notification to admin
    try {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: 'Account Activated',
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111; max-width: 600px; margin: 0 auto;">
            <h2 style="margin: 0 0 12px; font-size: 20px; color: #1A2336;">Account Activated</h2>
            <p style="margin: 0 0 8px;">An account has been activated.</p>
            <p style="margin: 0 0 4px;"><strong>Email:</strong> ${normalizedEmail}</p>
            ${existing.name ? `<p style="margin: 0 0 4px;"><strong>Name:</strong> ${existing.name}</p>` : ''}
            <p style="margin: 16px 0 0; font-size: 13px; color: #6B7280;">
              This is an automated notification sent to the GuruLink admin.
            </p>
          </div>
        `,
        categories: ['admin', 'activation'],
      });
    } catch (adminEmailError) {
      console.error('[Admin] Failed to send admin activation notification:', adminEmailError);
    }

    return res.json({ ok: true, message: 'Account activated' });
  } catch (error) {
    console.error('[Admin] Failed to activate account:', error);
    return res.status(500).json({ error: 'Failed to activate account' });
  }
});

// Admin: restore/reactivate a cancelled subscription for a user by email - SUPER ADMIN AND ADMIN ONLY
router.post('/customers/restore-subscription', requireRole(['super_admin', 'admin']), async (req, res) => {
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

    try {
      const customers = await stripe.customers.list({
        email: normalizedEmail,
        limit: 1,
      });

      if (customers.data.length > 0) {
        customer = customers.data[0];

        // Get all subscriptions to check status
        const allSubscriptions = await stripe.subscriptions.list({
          customer: customer.id,
          status: 'all',
          limit: 10,
        });

        // First, try to find active subscription with cancel_at_period_end
        subscription = allSubscriptions.data.find(
          (sub) => sub.status === 'active' && sub.cancel_at_period_end === true
        );

        if (subscription) {
          // Subscription is active but scheduled for cancellation - remove the cancellation
          await stripe.subscriptions.update(subscription.id, {
            cancel_at_period_end: false,
          });
          console.log(`[Admin] Subscription ${subscription.id} restored (cancellation removed)`);
          
          // Send reactivation email to customer
          try {
            await sendSubscriptionReactivationEmail({
              to: normalizedEmail,
              name: signup.name,
            });
          } catch (emailError) {
            console.error('[Admin] Failed to send reactivation email:', emailError);
          }

          // Send notification to admin
          try {
            await sendEmail({
              to: ADMIN_EMAIL,
              subject: 'Subscription Reactivated',
              html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111; max-width: 600px; margin: 0 auto;">
                  <h2 style="margin: 0 0 12px; font-size: 20px; color: #1A2336;">Subscription Reactivated</h2>
                  <p style="margin: 0 0 8px;">A subscription has been reactivated.</p>
                  <p style="margin: 0 0 4px;"><strong>Email:</strong> ${normalizedEmail}</p>
                  ${signup.name ? `<p style="margin: 0 0 4px;"><strong>Name:</strong> ${signup.name}</p>` : ''}
                  <p style="margin: 0 0 4px;"><strong>Subscription ID:</strong> ${subscription.id}</p>
                  <p style="margin: 16px 0 0; font-size: 13px; color: #6B7280;">
                    This is an automated notification sent to the GuruLink admin.
                  </p>
                </div>
              `,
              categories: ['admin', 'reactivation'],
            });
          } catch (adminEmailError) {
            console.error('[Admin] Failed to send admin reactivation notification:', adminEmailError);
          }

          // Create CRM notification for subscription reactivation
          try {
            await createNotification({
              type: 'subscription_reactivated',
              title: 'Subscription Reactivated',
              message: signup.name
                ? `Subscription reactivated for ${signup.name} (${normalizedEmail})`
                : `Subscription reactivated for ${normalizedEmail}`,
              data: {
                email: normalizedEmail,
                name: signup.name || null,
                subscriptionId: subscription.id,
                reactivatedBy: 'admin',
              },
            });
            console.log('[Admin] ✅ CRM notification created for subscription reactivation');
          } catch (notifError) {
            console.error('[Admin] Failed to create CRM notification for reactivation:', notifError);
          }
        } else {
          // Check if there's an active subscription without cancel_at_period_end
          const activeSub = allSubscriptions.data.find((sub) => sub.status === 'active');
          if (activeSub && !activeSub.cancel_at_period_end) {
            return res.status(400).json({ error: 'Subscription is already active and not scheduled for cancellation.' });
          }

          // Check for fully cancelled subscriptions
          const cancelledSub = allSubscriptions.data.find(
            (sub) => sub.status === 'canceled' || sub.status === 'incomplete_expired'
          );

          if (cancelledSub) {
            return res.status(400).json({
              error: 'Subscription has already been cancelled and cannot be restored. Please create a new subscription.',
            });
          } else {
            return res.status(404).json({ error: 'No subscription found to restore. Subscription may not be scheduled for cancellation.' });
          }
        }
      } else {
        return res.status(404).json({ error: 'No customer found for this email.' });
      }
    } catch (stripeError) {
      console.error('[Admin] Stripe error during restore:', stripeError);
      return res.status(500).json({ error: 'Failed to restore subscription via Stripe.' });
    }

    return res.json({
      ok: true,
      message: 'Subscription restored successfully.',
      subscription: {
        id: subscription.id,
        cancelAtPeriodEnd: false,
        status: subscription.status,
      },
    });
  } catch (error) {
    console.error('[Admin] Restore subscription error:', error);
    return res.status(500).json({ error: error.message || 'Failed to restore subscription' });
  }
});

// Admin: cancel active subscription (mark cancel_at_period_end) for a user by email - SUPER ADMIN AND ADMIN ONLY
router.post('/customers/cancel-subscription', requireRole(['super_admin', 'admin']), async (req, res) => {
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

    // Create CRM notification for subscription cancellation
    try {
      const formattedPeriodEnd = periodEndDate
        ? new Date(periodEndDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : 'the end of billing cycle';
      
      await createNotification({
        type: 'subscription_cancelled',
        title: 'Subscription Cancelled',
        message: signup.name
          ? `Subscription cancelled for ${signup.name} (${normalizedEmail}) - ends ${formattedPeriodEnd}`
          : `Subscription cancelled for ${normalizedEmail} - ends ${formattedPeriodEnd}`,
        data: {
          email: normalizedEmail,
          name: signup.name || null,
          periodEndDate: formattedPeriodEnd,
          cancelledBy: 'admin',
        },
      });
      console.log('[Admin] ✅ CRM notification created for subscription cancellation');
    } catch (notifError) {
      console.error('[Admin] Failed to create CRM notification for cancellation:', notifError);
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


