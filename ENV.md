# Environment variables

Add a `.env` file with these keys:

PORT=4000
NODE_ENV=development
GEMINI_API_KEY=AIzaSyCoDgjz0QppIykREqBBkd4jsNowgYlInys
SENDGRID_API_KEY=SG-...
DATABASE_URL=postgres://user:password@localhost:5432/soulmate
EMAIL_FROM=Soulmate App <no-reply@example.com>
APP_URL=http://localhost:5173
MOCK_MODE=false
FALLBACK_IMAGE_URL_TEMPLATE=https://api.dicebear.com/7.x/{style}/png?seed={seed}&size=512&radius=40&backgroundType=gradientLinear

## SendGrid Setup

### 1. Get Your SendGrid API Key
1. Sign up at https://sendgrid.com
2. Go to **Settings → API Keys**
3. Create an API key with **"Mail Send"** permissions
4. Copy the key (starts with `SG.`)

### 2. Verify Your Sender Identity (IMPORTANT!)
**You MUST verify the email address in `EMAIL_FROM` before sending emails.**

**Option A: Verify Single Sender (Easiest for Development)**
1. Go to **Settings → Sender Authentication → Single Sender Verification**
2. Click **Create New Sender**
3. Fill in your details:
   - **From Email**: Use the email address from `EMAIL_FROM` (e.g., `no-reply@yourdomain.com`)
   - **From Name**: Use the name from `EMAIL_FROM` (e.g., `Soulmate App`)
   - Fill in the required fields
4. Check your email inbox and click the verification link
5. Wait for verification status to show as "Verified" (may take a few minutes)

**Option B: Domain Authentication (Required for Production)**
1. Go to **Settings → Sender Authentication → Domain Authentication**
2. Follow the DNS setup instructions
3. This allows you to send from any email address on your domain

### 3. Configure EMAIL_FROM
Set `EMAIL_FROM` in your `.env` file to match your verified sender:
- Format: `Name <email@domain.com>` or just `email@domain.com`
- Example: `Soulmate App <no-reply@yourdomain.com>`

**Common Error:** If you see "The from address does not match a verified Sender Identity", it means the email address in `EMAIL_FROM` hasn't been verified in SendGrid yet.


