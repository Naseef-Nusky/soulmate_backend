# Environment variables

Add a `.env` file with these keys:

PORT=4000
NODE_ENV=development
GEMINI_API_KEY=AIzaSyCoDgjz0QppIykREqBBkd4jsNowgYlInys

# Image Generation (optional - for actual image generation)
# Gemini enhances the prompt, then one of these services generates the image:
# Option 1: Replicate API (recommended - supports Stable Diffusion)
REPLICATE_API_TOKEN=your-replicate-api-token
# Option 2: Stability AI (alternative)
STABILITY_API_KEY=your-stability-api-key
# If neither is set, will use fallback placeholder images

# SendGrid Email Service (Recommended)
SENDGRID_API_KEY=SG.your-sendgrid-api-key-here
EMAIL_FROM=GuruLinkApp <soulmate@gurulink.app>

# Optional: Artist team email for notifications
ARTIST_TEAM_EMAIL=artists@gurulink.app

# Google Cloud Translation (server-side; never expose in frontend)
GOOGLE_TRANSLATE_API_KEY=your-google-cloud-translation-api-key

DATABASE_URL=postgres://user:password@localhost:5432/soulmate
APP_URL=http://localhost:5173
MOCK_MODE=false
FALLBACK_IMAGE_URL_TEMPLATE=https://api.dicebear.com/7.x/{style}/png?seed={seed}&size=512&radius=40&backgroundType=gradientLinear

# Stripe Payments (required for gated signup)
STRIPE_SECRET_KEY=sk_live_...

# DigitalOcean Spaces (for image storage)
# Required to upload images to Spaces and store the public URL in DB
SPACES_ACCESS_KEY_ID=DOXXXXXXXXXXXXXXX
SPACES_SECRET_ACCESS_KEY=XXXXXXXXXXXXXXXXXXXXXXXX
SPACES_BUCKET=soulmateimage
SPACES_ENDPOINT=https://lon1.digitaloceanspaces.com
# Optional: custom/public base URL (e.g., CDN or bucket website)
SPACES_PUBLIC_URL=https://soulmateimage.lon1.digitaloceanspaces.com

<!-- Stripe/subscription configuration removed -->

## Email Setup (SendGrid)

### 1. Get Your SendGrid API Key
1. Sign up for a free SendGrid account at https://sendgrid.com
2. Go to **Settings** → **API Keys**
3. Click **Create API Key**
4. Give it a name (e.g., "GuruLink Production")
5. Select **Full Access** or **Restricted Access** with Mail Send permissions
6. Copy the API key (starts with `SG.`)

### 2. Verify Your Sender Email
1. Go to **Settings** → **Sender Authentication**
2. Click **Verify a Single Sender** or set up **Domain Authentication** (recommended)
3. Verify your email address (e.g., `soulmate@gurulink.app`)

### 3. Configure Environment Variables
Add these to your `.env` file:

```env
SENDGRID_API_KEY=SG.your-api-key-here
EMAIL_FROM=GuruLinkApp <soulmate@gurulink.app>
```

**Optional:**
```env
ARTIST_TEAM_EMAIL=artists@gurulink.app
LOG_EMAIL=true  # Enable email logging
```

### 4. Test Email Sending
After restarting the backend, check logs for:
- `[Email] SendGrid initialized and ready to send messages` (success)
- `[Email] SendGrid API key not configured` (missing API key)

**With debug routes enabled:**
```bash
ENABLE_DEBUG_ROUTES=true
```
You can POST to `/api/debug/test-email` with optional body `{ "to": "you@example.com" }` to trigger a test email.

### 5. Benefits of SendGrid
- ✅ No SMTP connection issues
- ✅ Better deliverability
- ✅ Email analytics and tracking
- ✅ Free tier: 100 emails/day
- ✅ No firewall/port configuration needed
- ✅ Reliable API-based sending

### 6. Common Issues
- **API key invalid**: Make sure you copied the full key starting with `SG.`
- **Sender not verified**: Verify your sender email in SendGrid dashboard
- **Rate limits**: Free tier allows 100 emails/day, upgrade for more


