import nodemailer from 'nodemailer';

// GoDaddy SMTP configuration
const smtpHost = process.env.SMTP_HOST || 'smtpout.secureserver.net';
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
const smtpPassword = process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD;
const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;

let transporter = null;

if (smtpUser && smtpPassword) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure, // true for 465, false for other ports
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
    tls: {
      rejectUnauthorized: false, // Some GoDaddy servers may need this
    },
  });

  // Verify connection on startup
  transporter.verify((error) => {
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[Email] SMTP connection failed:', error?.message || error);
    } else {
      // eslint-disable-next-line no-console
      console.log('[Email] SMTP server is ready to send messages');
    }
  });
} else {
  // eslint-disable-next-line no-console
  console.warn('[Email] SMTP disabled: set SMTP_USER and SMTP_PASSWORD (or EMAIL_USER and EMAIL_PASSWORD)');
}

export async function sendResultsEmail({ to, report, imageUrl }) {
  if (!transporter) return;
  const from = process.env.EMAIL_FROM || smtpUser || 'no-reply@example.com';
  const html = `
    <div>
      <h2>Your Soulmate Personality Report</h2>
      <p>${report?.replace(/\n/g, '<br/>')}</p>
      ${imageUrl ? `<img src="${imageUrl}" alt="Soulmate portrait" style="max-width: 512px; border-radius: 8px;"/>` : ''}
    </div>
  `;
  try {
    await transporter.sendMail({
      from,
      to,
      subject: 'Your Soulmate Results',
      html,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[Email] Results send failed from "${from}" to "${to}":`, error?.message || error);
    throw error;
  }
}

export async function sendTwinFlameEmail({ to, imageUrl }) {
  if (!transporter) return;
  const from = process.env.EMAIL_FROM || smtpUser || 'no-reply@example.com';
  const ctaUrl = imageUrl || process.env.APP_URL || 'http://localhost:5173';
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111">
      <h2 style="margin: 0 0 12px; font-size: 22px;">Twin Flame Connection Discovered</h2>
      <p>Hi there,</p>
      <p>
        Something unprecedented just happened that I had to share immediately - another psychic artist completed a sketch showing
        someone actively searching for a person matching YOUR energy signature. These synchronized sketches are incredibly rare and
        often indicate an imminent twin flame connection.
      </p>
      <ul>
        <li>Both sketches share mysterious matching symbols</li>
        <li>The energy signatures are perfectly mirrored</li>
        <li>Timeline indicators suggest paths crossing soon</li>
        <li>Twin flame markers are clearly visible</li>
      </ul>
      <blockquote style="margin: 16px 0; padding: 12px 16px; background: #f7f7f7; border-left: 3px solid #9146ff; border-radius: 4px;">
        "I couldn't believe it when I received the email about synchronized sketches. A week later, I met Michael at a friend's
        gathering. We both had been searching for each other and had our sketches done in the same week! The matching symbols in our
        drawings gave me chills." — <strong>Sarah M.</strong>
      </blockquote>
      <p style="margin: 16px 0;">
        <strong>⚠️ Important:</strong> When twin flame sketches align like this, it often indicates a critical meeting window approaching.
        The energy connection is strongest when both parties acknowledge it.
      </p>
      <div style="margin: 20px 0;">
        <a href="${ctaUrl}" target="_blank" rel="noopener noreferrer"
           style="display: inline-block; background: #6d28d9; color: #fff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;">
          See Your Soulmate Sketch Now
        </a>
      </div>
      ${imageUrl ? `<img src="${imageUrl}" alt="Soulmate portrait" style="max-width: 560px; border-radius: 10px; display:block; margin-top: 8px;"/>` : ''}
      <p style="margin-top: 20px;">The universe rarely aligns energies this perfectly. Your destined connection is searching for you at this very moment.</p>
      <p style="margin-top: 16px;">With anticipation,<br/>The Hint Team</p>
    </div>
  `;
  try {
    await transporter.sendMail({
      from,
      to,
      subject: 'Twin Flame Connection Discovered',
      html,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[Email] TwinFlame send failed from "${from}" to "${to}":`, error?.message || error);
    throw error;
  }
}

export async function sendArtistRequestEmail({ requestEmail, contact, notes, jobId, answers }) {
  if (!transporter) return;
  const from = process.env.EMAIL_FROM || smtpUser || 'no-reply@example.com';
  const to = process.env.ARTIST_TEAM_EMAIL || process.env.EMAIL_FROM || smtpUser || 'no-reply@example.com';
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
  try {
    await transporter.sendMail({
      from,
      to,
      subject: 'New Soulmate Sketch Request',
      html,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[Email] ArtistRequest send failed from "${from}" to "${to}":`, error?.message || error);
    throw error;
  }
}
