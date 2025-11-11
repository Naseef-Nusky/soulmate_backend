# Fix: Emails Going to Spam Folder

## Why Emails Go to Spam

Emails go to spam for several reasons:
1. **No Domain Authentication** (SPF, DKIM, DMARC)
2. **Low Sender Reputation**
3. **Spam-triggering Content**
4. **Missing Unsubscribe Links**
5. **Poor Email Formatting**
6. **Using Free Email Domains**

## Solutions to Improve Deliverability

### 1. Set Up Domain Authentication in SendGrid (MOST IMPORTANT)

This is the #1 way to improve deliverability:

1. Go to **SendGrid Dashboard** → **Settings** → **Sender Authentication**
2. Click **Authenticate Your Domain** (not "Verify Single Sender")
3. Enter your domain: `gurulink.app`
4. Follow the DNS setup instructions:
   - Add SPF record
   - Add DKIM records (CNAME records)
   - Add DMARC record (optional but recommended)
5. Wait for verification (can take up to 48 hours)

**Why this helps:**
- Proves you own the domain
- Prevents email spoofing
- Increases trust with email providers
- Significantly improves inbox placement

### 2. Warm Up Your Domain (For New Domains)

If you just set up the domain:
- Start with low volume (10-20 emails/day)
- Gradually increase over 2-4 weeks
- Send to engaged users first
- Monitor bounce rates

### 3. Improve Email Content

✅ **DO:**
- Use clear, professional subject lines
- Include plain text version
- Add proper email structure
- Include physical address (required by law)
- Use consistent sender name

❌ **DON'T:**
- Use ALL CAPS in subject
- Use excessive exclamation marks!!!
- Use spam trigger words (FREE, CLICK NOW, etc.)
- Send from free email domains (gmail.com, yahoo.com)
- Use URL shorteners

### 4. Monitor SendGrid Dashboard

Check regularly:
- **Activity** → **Email Activity**: See delivery status
- **Suppressions**: Check if emails are being suppressed
- **Bounce Management**: Monitor bounce rates
- **Reputation**: Check sender reputation score

### 5. Best Practices

**Subject Lines:**
- Keep under 50 characters
- Be specific and clear
- Avoid spam words
- Example: "Your Login Link - GuruLink" ✅
- Bad: "CLICK HERE NOW!!! FREE!!!" ❌

**Email Content:**
- Include both HTML and plain text
- Use proper email structure
- Include unsubscribe link (if transactional, mention it's required)
- Add physical address in footer

**Sending:**
- Send from verified domain
- Use consistent "From" name
- Don't send to invalid emails
- Monitor bounce rates (< 5% is good)

### 6. Check Your Current Setup

```bash
# Check if domain is authenticated
# Go to SendGrid Dashboard → Settings → Sender Authentication
# Should show "Authenticated" status for gurulink.app
```

### 7. Test Email Deliverability

Use these tools:
- **Mail Tester**: https://www.mail-tester.com
- **MXToolbox**: https://mxtoolbox.com/blacklists.aspx
- **SendGrid Inbox Placement**: Check in SendGrid dashboard

### 8. If Still Going to Spam

1. **Check SendGrid Reputation**:
   - Go to **Settings** → **Reputation**
   - Should be "Good" or "Excellent"

2. **Check Suppressions**:
   - Go to **Suppressions**
   - Remove any incorrect suppressions

3. **Contact Recipients**:
   - Ask them to mark as "Not Spam"
   - Add sender to contacts
   - This helps improve reputation

4. **Use Subdomain**:
   - Consider using `mail.gurulink.app` for emails
   - Keeps main domain reputation separate

## Quick Checklist

- [ ] Domain authenticated in SendGrid (SPF, DKIM, DMARC)
- [ ] Sender email verified
- [ ] Physical address in email footer
- [ ] Plain text version included
- [ ] Professional subject lines
- [ ] No spam trigger words
- [ ] Consistent sender name
- [ ] Monitoring bounce rates
- [ ] Low complaint rates

## Current Email Improvements Made

I've updated the email service to:
- ✅ Include plain text version
- ✅ Better email structure
- ✅ Professional subject lines
- ✅ Proper email formatting
- ✅ Categories for tracking

**Next Step**: Set up domain authentication in SendGrid dashboard - this is the most important step!

