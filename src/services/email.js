import sgMail from '@sendgrid/mail';

// SendGrid configuration
const sendGridApiKey = process.env.SENDGRID_API_KEY;
const EMAIL_LOGS = process.env.LOG_EMAIL === 'true';
const EMAIL_FROM = process.env.EMAIL_FROM || 'soulmate@gurulink.app';

// Initialize SendGrid
if (sendGridApiKey) {
  sgMail.setApiKey(sendGridApiKey);
  if (EMAIL_LOGS) {
    console.log('[Email] SendGrid initialized and ready to send messages');
  }
} else {
  if (EMAIL_LOGS) {
    console.warn('[Email] SendGrid API key not configured. Set SENDGRID_API_KEY in .env');
  }
}

// Helper function to send email via SendGrid
async function sendEmail({ to, subject, html, text, categories }) {
  if (!sendGridApiKey) {
    const error = new Error('SendGrid API key not configured. Set SENDGRID_API_KEY in .env');
    console.error('[Email]', error.message);
    throw error;
  }

  // Clean HTML for plain text fallback
  const plainText = text || html?.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

  const msg = {
    to,
    from: EMAIL_FROM,
    subject,
    html,
    text: plainText,
    // Add categories for tracking
    categories: categories || ['transactional'],
    // Add headers to improve deliverability
    headers: {
      'X-Entity-Ref-ID': `gurulink-${Date.now()}`,
      'List-Unsubscribe': `<${process.env.APP_URL || 'https://gurulink.app'}/unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    // Mail settings for better deliverability
    mailSettings: {
      sandboxMode: {
        enable: process.env.SENDGRID_SANDBOX === 'true', // Only enable for testing
      },
      // Enable click tracking for better analytics
      clickTracking: {
        enable: true,
        enableText: true,
      },
      // Enable open tracking
      openTracking: {
        enable: true,
      },
    },
  };

  try {
    const [response] = await sgMail.send(msg);
    if (EMAIL_LOGS) {
      console.log(`[Email] ✅ Sent to ${to} - Status: ${response.statusCode}`);
    }
    return { success: true, statusCode: response.statusCode };
  } catch (error) {
    // Always log errors (not just when EMAIL_LOGS is true)
    const errorDetails = {
      message: error.message,
      code: error.code,
      response: error.response?.body || null,
      statusCode: error.response?.statusCode || null,
    };
    
    console.error(`[Email] ❌ Send failed to "${to}":`, JSON.stringify(errorDetails, null, 2));
    
    // Provide helpful error messages
    if (error.response?.body) {
      const body = error.response.body;
      if (Array.isArray(body.errors)) {
        body.errors.forEach(err => {
          console.error(`[Email] Error: ${err.message} (Field: ${err.field || 'N/A'})`);
        });
      }
    }
    
    throw error;
  }
}

export async function sendResultsEmail({ to, report, imageUrl }) {
  if (!sendGridApiKey) return;
  
  const html = `
    <div>
      <h2>Your Soulmate Personality Report</h2>
      <p>${report?.replace(/\n/g, '<br/>')}</p>
      ${imageUrl ? `<img src="${imageUrl}" alt="Soulmate portrait" style="max-width: 512px; border-radius: 8px;"/>` : ''}
    </div>
  `;
  
  await sendEmail({
    to,
    subject: 'Your Soulmate Results',
    html,
  });
}

export async function sendTwinFlameEmail({ to, imageUrl }) {
  if (!sendGridApiKey) {
    const error = new Error('SendGrid API key not configured. Set SENDGRID_API_KEY in .env');
    console.error('[Email] Twin Flame email cannot be sent:', error.message);
    throw error;
  }
  
  // Validate and normalize email
  if (!to) {
    const error = new Error('Email address is required for Twin Flame email');
    console.error('[Email] Twin Flame email cannot be sent:', error.message);
    throw error;
  }
  
  const normalizedEmail = String(to).trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    const error = new Error(`Invalid email address: ${to}`);
    console.error('[Email] Twin Flame email cannot be sent:', error.message);
    throw error;
  }
  
  if (EMAIL_LOGS) {
    console.log(`[Email] Preparing to send Twin Flame email to: ${normalizedEmail}`);
  }
  
  const ctaUrl = imageUrl || process.env.APP_URL || 'http://localhost:5173';
  const escapedCtaUrl = ctaUrl.replace(/"/g, '&quot;');
  const escapedImageUrl = imageUrl ? imageUrl.replace(/"/g, '&quot;') : '';
  
  const html = `
    <!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Twin Flame Alert — GuruLink</title>
  </head>
  <body style="margin:0; padding:0; font-family:Arial, sans-serif; background-color:#f5f5f5;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;">
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#ffffff; border-radius:8px; max-width:600px;">
            <tr>
              <td style="padding:40px 30px;">

                <h2 style="margin:0 0 12px 0; font-size:22px; color:#111;">A Powerful Twin Flame Signal Detected</h2>
                <p style="margin:0 0 16px 0; font-size:16px; color:#111; line-height:1.6;">Hello,</p>

                <p style="margin:0 0 16px 0; font-size:16px; color:#111; line-height:1.6;">
                  We’ve encountered something remarkable — another intuitive artist has completed a sketch that aligns directly with the energetic
                  profile we identified for you. These dual‑sketch alignments are extremely uncommon and often point to a twin flame connection drawing closer.
                </p>

                <ul style="margin:0 0 16px 0; padding-left:20px; color:#111;">
                  <li style="margin:8px 0;">Both sketches contain uniquely matching symbols</li>
                  <li style="margin:8px 0;">The energy patterns reflect each other perfectly</li>
                  <li style="margin:8px 0;">Indicators suggest a significant encounter approaching</li>
                  <li style="margin:8px 0;">Clear twin flame markers are present in both readings</li>
                </ul>

                <blockquote style="margin:16px 0; padding:12px 16px; background:#f7f7f7; border-left:3px solid #9146ff; border-radius:4px;">
                  <p style="margin:0; font-style:italic; color:#111; line-height:1.6;">
                    "I was stunned when I heard about synchronized sketches. A week later, I met Michael at a gathering — we had both gotten our
                    soulmate drawings the same week. The matching symbols were unbelievable." — <strong>Sarah M.</strong>
                  </p>
                </blockquote>

                <p style="margin:16px 0; font-size:16px; color:#111; line-height:1.6;">
                  <strong>⚠️ Important:</strong> When twin flame sketches line up like this, it often marks a powerful energetic window. The connection becomes
                  strongest when both individuals acknowledge it.
                </p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="padding:20px 0;">
                      <a href="${escapedCtaUrl}" target="_blank" style="display:inline-block; background-color:#6d28d9; color:#fff; padding:12px 18px; border-radius:8px; font-weight:600; font-size:16px; text-decoration:none;">
                        View Your Soulmate Sketch
                      </a>
                    </td>
                  </tr>
                </table>

                ${imageUrl ? `<img src="${escapedImageUrl}" alt="Soulmate portrait" style="max-width:100%; border-radius:10px; display:block; margin:20px 0;" />` : ''}

                <p style="margin:20px 0 16px 0; font-size:16px; color:#111; line-height:1.6;">
                  These alignments are rare — the person connected to your energy may be seeking you at this very moment.
                </p>

                <p style="margin:0; font-size:16px; color:#111; line-height:1.6;">
                  With insight and guidance,<br/>The GuruLink Team
                </p>

              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
  
  try {
    await sendEmail({
      to: normalizedEmail,
      subject: 'Twin Flame Connection Discovered',
      html,
      categories: ['twin-flame', 'soulmate'],
    });
    if (EMAIL_LOGS) {
      console.log(`[Email] ✅ Twin Flame email sent successfully to ${normalizedEmail}`);
    }
  } catch (error) {
    console.error(`[Email] ❌ Twin Flame email failed to send to ${normalizedEmail}:`, error?.message || error);
    throw error;
  }
}

export async function sendArtistRequestEmail({ requestEmail, contact, notes, jobId, answers }) {
  if (!sendGridApiKey) return;
  
  const to = process.env.ARTIST_TEAM_EMAIL || EMAIL_FROM;
  const html = `
    <div>
      <h2>New Artist Sketch Request</h2>
      <p><strong>Job ID:</strong> ${jobId || '—'}</p>
      <p><strong>Requester Email:</strong> ${requestEmail || '—'}</p>
      <p><strong>Contact:</strong> ${contact || '—'}</p>
      <p><strong>Notes:</strong> ${notes || '—'}</p>
      <pre style="white-space: pre-wrap; background: #f6f6f6; padding: 8px; border-radius: 6px;">${JSON.stringify(answers || {}, null, 2)}</pre>
    </div>
  `;
  
  await sendEmail({
    to,
    subject: 'New Soulmate Sketch Request',
    html,
  });
}

export async function sendSketchReadyEmail({ to, name, sketchUrl }) {
  if (!sendGridApiKey) {
    const error = new Error('SendGrid API key not configured. Set SENDGRID_API_KEY in .env');
    console.error('[Email] Sketch ready email cannot be sent:', error.message);
    throw error;
  }
  
  // Validate and normalize email
  if (!to) {
    const error = new Error('Email address is required for sketch ready email');
    console.error('[Email] Sketch ready email cannot be sent:', error.message);
    throw error;
  }
  
  const normalizedEmail = String(to).trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    const error = new Error(`Invalid email address: ${to}`);
    console.error('[Email] Sketch ready email cannot be sent:', error.message);
    throw error;
  }
  
  if (EMAIL_LOGS) {
    console.log(`[Email] Preparing to send sketch ready email to: ${normalizedEmail}`);
  }
  
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const dashboardUrl = sketchUrl || `${appUrl}/dashboard?tab=insight&showSoulmate=true`;
  const escapedDashboardUrl = dashboardUrl.replace(/"/g, '&quot;');
  
  const html = `
    <!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Soulmate Sketch is Ready — GuruLink</title>
  </head>
  <body style="margin:0; padding:0; font-family:Arial, sans-serif; background-color:#f5f5f5;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;">
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#ffffff; border-radius:8px; max-width:600px;">
            <tr>
              <td style="padding:40px 30px;">

                <h2 style="margin:0 0 12px 0; font-size:22px; color:#111;">Your Personalized Sketch is Ready!</h2>
                <p style="margin:0 0 16px 0; font-size:16px; color:#111; line-height:1.6;">Hello${name ? `, ${name}` : ''},</p>

                <p style="margin:0 0 16px 0; font-size:16px; color:#111; line-height:1.6;">
                  Great news! Your personalized sketch and reading from GuruLink are now ready. Our artists have carefully analyzed your details and crafted a precise, meaningful portrait and interpretation just for you.
                </p>

                <p style="margin:0 0 16px 0; font-size:16px; color:#111; line-height:1.6;">
                  Your soulmate sketch includes:
                </p>

                <ul style="margin:0 0 16px 0; padding-left:20px; color:#111;">
                  <li style="margin:8px 0;">A beautifully hand-drawn portrait of your soulmate</li>
                  <li style="margin:8px 0;">Personalized astrological compatibility analysis</li>
                  <li style="margin:8px 0;">Detailed description of your soulmate's character and traits</li>
                  <li style="margin:8px 0;">Insights into your emotional connection</li>
                </ul>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="padding:20px 0;">
                      <a href="${escapedDashboardUrl}" target="_blank" style="display:inline-block; background-color:#D4A34B; color:#1A2336; padding:12px 18px; border-radius:8px; font-weight:600; font-size:16px; text-decoration:none;">
                        View Your Soulmate Sketch
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:20px 0 16px 0; font-size:16px; color:#111; line-height:1.6;">
                  We appreciate your patience while we created something truly special for you!
                </p>

                <p style="margin:0; font-size:16px; color:#111; line-height:1.6;">
                  With insight and guidance,<br/>The GuruLink Team
                </p>

              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
  
  try {
    await sendEmail({
      to: normalizedEmail,
      subject: 'Your Soulmate Sketch is Ready!',
      html,
      categories: ['sketch-ready', 'soulmate'],
    });
    if (EMAIL_LOGS) {
      console.log(`[Email] ✅ Sketch ready email sent successfully to ${normalizedEmail}`);
    }
  } catch (error) {
    console.error(`[Email] ❌ Sketch ready email failed to send to ${normalizedEmail}:`, error?.message || error);
    throw error;
  }
}

export async function sendLoginLinkEmail({ to, loginLink, name }) {
  if (!sendGridApiKey) {
    console.error('[Email] Cannot send login link: SendGrid API key not configured');
    return;
  }
  
  // Escape the login link to prevent issues
  const escapedLoginLink = loginLink.replace(/"/g, '&quot;');
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="background-color: #ffffff; border-radius: 8px; max-width: 600px;">
              <tr>
                <td style="padding: 40px 30px;">
                  <p style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #1A2336;">Your Login Link</p>
                  <p style="margin: 0 0 20px 0; font-size: 16px; color: #111;">Hey there${name ? ` ${name}` : ''},</p>
                  <p style="margin: 0 0 30px 0; font-size: 16px; color: #111; line-height: 1.6;">Click the button below to securely log in to your GuruLink account. This link will expire in 1 hour.</p>
                  
                  <!-- Button -->
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                      <td align="center" style="padding: 0 0 30px 0;">
                        <a href="${escapedLoginLink}" target="_blank" style="display: inline-block; background-color: #D4A34B; color: #1A2336; text-decoration: none; padding: 14px 32px; border-radius: 999px; font-weight: 600; font-size: 16px; mso-hide: all;">
                          <span style="color: #1A2336; text-decoration: none;">Log In to My Account</span>
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="margin: 0 0 20px 0; font-size: 14px; color: #666; line-height: 1.6;">
                    Or copy and paste this link into your browser:<br/>
                    <a href="${escapedLoginLink}" style="color: #D4A34B; text-decoration: underline; word-break: break-all;">${loginLink}</a>
                  </p>
                  
                  <p style="margin: 0 0 24px 0; font-size: 16px; color: #111; line-height: 1.6;">If you are unable to sign in using the button above, please contact us at <a href="mailto:help@gurulink.app" style="color: #D4A34B; text-decoration: underline;">help@gurulink.app</a>.</p>
                  
                  <p style="margin: 0 0 24px 0; font-size: 16px; color: #111;">Thanks,<br/>The GuruLink Team</p>
                  
                  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
                  
                  <p style="margin: 0 0 12px 0; font-size: 12px; color: #999; line-height: 1.5;">
                    © 2025 GuruLink, All rights reserved.<br/>
                  </p>
                  <p style="margin: 0 0 8px 0; font-size: 12px; color: #999; line-height: 1.5;">
                    You are receiving this email because you signed up for an account with GuruLink.
                  </p>
                  <p style="margin: 0; font-size: 11px; color: #999; line-height: 1.5;">
                    If you did not request this login link, please ignore this email or contact us at <a href="mailto:help@gurulink.app" style="color: #D4A34B; text-decoration: underline;">help@gurulink.app</a>.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
  
  // Plain text version
  const text = `Your Login Link

Hey there${name ? ` ${name}` : ''},

Click the link below to securely log in to your GuruLink account. This link will expire in 1 hour.

${loginLink}

If you are unable to sign in using the link above, please contact us at help@gurulink.app.

Thanks,
The GuruLink Team

© 2025 GuruLink, All rights reserved.

You are receiving this email because you signed up for an account with GuruLink.
If you did not request this login link, please ignore this email.`;
  
  try {
    await sendEmail({
      to,
      subject: 'Your Login Link - GuruLink',
      html,
      text,
      categories: ['login', 'authentication'],
    });
    if (EMAIL_LOGS) {
      console.log(`[Email] Login link sent to ${to}`);
    }
  } catch (error) {
    if (EMAIL_LOGS) {
      console.error(`[Email] Login link send failed to "${to}":`, error?.message || error);
    }
    throw error;
  }
}


export async function sendMonthlyHoroscopeEmail({ to, report, month, year, subscription }) {
  if (!sendGridApiKey) return;
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[month - 1];
  
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111; max-width: 600px; margin: 0 auto;">
      <h2 style="margin: 0 0 12px; font-size: 22px; color: #D4A34B;">Your Monthly Horoscope - ${monthName} ${year}</h2>
      <p>Hello,</p>
      <p>Your personalized monthly horoscope reading for ${monthName} ${year} is ready!</p>
      <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #D4A34B;">
        <div style="white-space: pre-wrap; line-height: 1.8;">${report}</div>
      </div>
      <p style="margin-top: 20px;">We hope this guidance helps you navigate the month ahead with clarity and confidence.</p>
      <p style="margin-top: 16px;">With cosmic wisdom,<br/>The GuruLink Team</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="font-size: 12px; color: #666;">
        You're receiving this because you have an active subscription to GuruLink's monthly horoscope service.
        ${subscription?.cancel_at_period_end ? 'Your subscription will end after this billing period.' : ''}
      </p>
    </div>
  `;
  
  try {
    await sendEmail({
      to,
      subject: `Your Monthly Horoscope - ${monthName} ${year}`,
      html,
    });
    if (EMAIL_LOGS) {
      console.log(`[Email] Monthly horoscope sent to ${to}`);
    }
  } catch (error) {
    if (EMAIL_LOGS) {
      console.error(`[Email] Monthly horoscope send failed to "${to}":`, error?.message || error);
    }
    throw error;
  }
}

