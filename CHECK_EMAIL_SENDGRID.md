# Troubleshooting: Email Not Received (SendGrid)

## Quick Diagnosis Steps

### 1. Check if SendGrid is Configured

```bash
cd backend-soulmate
node -e "require('dotenv').config(); console.log('SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? 'SET ✅' : 'MISSING ❌');"
```

### 2. Enable Email Logging

Add to your `.env` file:
```env
LOG_EMAIL=true
```

Then restart your backend and check logs:
```bash
pm2 logs gurulink-api --lines 50 | grep -i email
```

Look for:
- `[Email] SendGrid initialized and ready to send messages` ✅
- `[Email] ✅ Sent to...` ✅ (email sent successfully)
- `[Email] ❌ Send failed...` ❌ (check error details)

### 3. Test Email Sending

```bash
cd backend-soulmate
node test-email-production.js your-email@example.com
```

### 4. Check SendGrid Dashboard

1. Go to https://app.sendgrid.com
2. Check **Activity** → **Email Activity**
3. Look for your sent emails and their status:
   - **Delivered** ✅ - Email was delivered
   - **Bounced** ❌ - Email address invalid
   - **Blocked** ❌ - Email blocked by recipient
   - **Dropped** ❌ - Email dropped (check reason)

## Common Issues & Fixes

### Issue 1: SendGrid API Key Not Set

**Symptoms:**
- Logs show: `SendGrid API key not configured`
- No emails sent

**Fix:**
1. Get API key from https://app.sendgrid.com/settings/api_keys
2. Add to `.env`:
   ```env
   SENDGRID_API_KEY=SG.your-api-key-here
   ```
3. Restart backend: `pm2 restart gurulink-api --update-env`

### Issue 2: Sender Email Not Verified

**Symptoms:**
- Error: `The from address does not match a verified Sender Identity`
- Status: **Dropped** in SendGrid dashboard

**Fix:**
1. Go to **Settings** → **Sender Authentication**
2. Click **Verify a Single Sender**
3. Enter your email (e.g., `soulmate@gurulink.app`)
4. Verify the email by clicking the link sent to your inbox
5. Wait a few minutes for verification to complete

### Issue 3: Email in Spam Folder

**Symptoms:**
- Email shows as **Delivered** in SendGrid
- But not in inbox

**Fix:**
1. Check spam/junk folder
2. Add sender to contacts
3. Set up Domain Authentication (recommended):
   - Go to **Settings** → **Sender Authentication** → **Authenticate Your Domain**
   - Follow the DNS setup instructions

### Issue 4: Rate Limits (Free Tier)

**Symptoms:**
- Error: `Rate limit exceeded`
- Free tier allows 100 emails/day

**Fix:**
- Upgrade SendGrid plan for more emails
- Or wait until next day

### Issue 5: Invalid Email Address

**Symptoms:**
- Status: **Bounced** in SendGrid dashboard
- Error: `Invalid email address`

**Fix:**
- Verify the email address is correct
- Check for typos
- Make sure email domain exists

### Issue 6: Email Blocked by Recipient

**Symptoms:**
- Status: **Blocked** in SendGrid dashboard

**Fix:**
- Recipient's email provider blocked the email
- Ask recipient to check spam folder
- Add sender to whitelist

## Production Server Check

If running on production server:

```bash
# SSH into server
ssh root@your-server-ip

# Check environment variables
cd /var/www/gurulink_api
cat .env | grep SENDGRID

# Check PM2 logs
pm2 logs gurulink-api --lines 100 | grep -i email

# Test email
node test-email-production.js your-email@example.com
```

## Enable Debug Mode

Add to `.env`:
```env
LOG_EMAIL=true
ENABLE_DEBUG_ROUTES=true
```

Then test via API:
```bash
curl -X POST http://localhost:4000/api/debug/test-email \
  -H "Content-Type: application/json" \
  -d '{"to": "your-email@example.com"}'
```

## SendGrid Dashboard Checks

1. **API Keys**: Settings → API Keys (make sure key is active)
2. **Sender Authentication**: Settings → Sender Authentication (verify sender email)
3. **Email Activity**: Activity → Email Activity (check delivery status)
4. **Suppressions**: Suppressions (check if email is suppressed)
5. **Bounce Management**: Settings → Bounce Management (check bounce settings)

## Still Not Working?

1. **Check SendGrid Status**: https://status.sendgrid.com
2. **Check API Key Permissions**: Make sure it has "Mail Send" permission
3. **Verify Domain**: Set up domain authentication for better deliverability
4. **Check Firewall**: Make sure server can make HTTPS requests to api.sendgrid.com
5. **Contact Support**: Check SendGrid support or logs for specific errors

