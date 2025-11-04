# Environment variables

Add a `.env` file with these keys:

PORT=4000
NODE_ENV=development
GEMINI_API_KEY=AIzaSyCoDgjz0QppIykREqBBkd4jsNowgYlInys
# GoDaddy SMTP (or other SMTP server)
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_USER=your-email@gurulink.app
SMTP_PASSWORD=your-email-password
SMTP_SECURE=false
EMAIL_FROM=GuruLinkApp <soulmate@gurulink.app>

# Alternative: use EMAIL_USER and EMAIL_PASSWORD instead
# EMAIL_USER=your-email@gurulink.app
# EMAIL_PASSWORD=your-email-password

DATABASE_URL=postgres://user:password@localhost:5432/soulmate
APP_URL=http://localhost:5173
MOCK_MODE=false
FALLBACK_IMAGE_URL_TEMPLATE=https://api.dicebear.com/7.x/{style}/png?seed={seed}&size=512&radius=40&backgroundType=gradientLinear

# DigitalOcean Spaces (for image storage)
# Required to upload images to Spaces and store the public URL in DB
SPACES_ACCESS_KEY_ID=DOXXXXXXXXXXXXXXX
SPACES_SECRET_ACCESS_KEY=XXXXXXXXXXXXXXXXXXXXXXXX
SPACES_BUCKET=soulmateimage
SPACES_ENDPOINT=https://lon1.digitaloceanspaces.com
# Optional: custom/public base URL (e.g., CDN or bucket website)
SPACES_PUBLIC_URL=https://soulmateimage.lon1.digitaloceanspaces.com

## Email Setup (GoDaddy SMTP)

### 1. Get Your GoDaddy Email Credentials
1. Log in to your GoDaddy account
2. Go to **Email & Office** → **Email Accounts**
3. Find your email account (e.g., `soulmate@gurulink.app`)
4. Note the email address and password

### 2. Configure SMTP Settings
Add these to your `.env` file:

**For GoDaddy Email (older plans):**
```
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_USER=soulmate@gurulink.app
SMTP_PASSWORD=your-email-password
SMTP_SECURE=false
EMAIL_FROM=GuruLinkApp <soulmate@gurulink.app>
```

**For GoDaddy Microsoft 365 Email:**
```
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=soulmate@gurulink.app
SMTP_PASSWORD=your-email-password
SMTP_SECURE=false
EMAIL_FROM=GuruLinkApp <soulmate@gurulink.app>
```

### 3. Alternative Environment Variables
You can also use `EMAIL_USER` and `EMAIL_PASSWORD` instead of `SMTP_USER` and `SMTP_PASSWORD`:
```
EMAIL_USER=soulmate@gurulink.app
EMAIL_PASSWORD=your-email-password
```

### 4. Test Email Sending
After restarting the backend, check logs for:
- `[Email] SMTP server is ready to send messages` (success)
- `[Email] SMTP connection failed: ...` (check credentials/host)

**Common Issues:**
- **Connection timeout**: Check if your server allows outbound connections on port 587/465
- **Authentication failed**: Verify email and password are correct
- **TLS errors**: Try setting `SMTP_SECURE=true` for port 465, or `SMTP_SECURE=false` for port 587


