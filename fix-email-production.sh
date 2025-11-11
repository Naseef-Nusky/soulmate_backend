#!/bin/bash
# Quick fix script for email working locally but not in production

set -e

echo "=========================================="
echo "  Email Production Fix Script"
echo "=========================================="

BACKEND_DIR="/var/www/gurulink_api"
cd "$BACKEND_DIR" || { echo "❌ Cannot access $BACKEND_DIR"; exit 1; }

# 1. Check .env file
echo ""
echo "=== 1. Checking .env file ==="
if [ ! -f .env ]; then
    echo "❌ .env file missing!"
    echo "Creating template..."
    cat > .env << 'ENVEOF'
PORT=4000
NODE_ENV=production
APP_URL=https://gurulink.app
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=soulmate@gurulink.app
SMTP_PASSWORD=CHANGE_ME
EMAIL_FROM=soulmate@gurulink.app
ENVEOF
    echo "⚠️  Please edit .env and set SMTP_PASSWORD:"
    echo "   nano .env"
    exit 1
fi
echo "✅ .env file exists"

# 2. Check SMTP variables
echo ""
echo "=== 2. Checking SMTP variables ==="
if ! grep -q "^SMTP_USER=" .env; then
    echo "❌ SMTP_USER missing in .env"
    exit 1
fi

SMTP_PASS=$(grep "^SMTP_PASSWORD=" .env | cut -d'=' -f2- | sed 's/^"//;s/"$//')
if [ -z "$SMTP_PASS" ] || [ "$SMTP_PASS" == "CHANGE_ME" ] || [ "$SMTP_PASS" == "your_password_here" ]; then
    echo "❌ SMTP_PASSWORD not set or using placeholder"
    echo "   Please edit .env and set SMTP_PASSWORD"
    exit 1
fi

echo "✅ SMTP variables found"

# 3. Test SMTP connectivity
echo ""
echo "=== 3. Testing SMTP connectivity ==="
if command -v nc &> /dev/null; then
    if timeout 5 nc -vz smtpout.secureserver.net 587 2>&1 | grep -q "succeeded\|open"; then
        echo "✅ SMTP port 587 is reachable"
    else
        echo "❌ SMTP port 587 is blocked (firewall issue)"
        echo "   Attempting to fix firewall..."
        
        # Try UFW
        if command -v ufw &> /dev/null; then
            ufw allow out 587/tcp 2>/dev/null || true
            ufw allow out 465/tcp 2>/dev/null || true
            ufw reload 2>/dev/null || true
            echo "   UFW rules updated"
        fi
        
        # Try iptables
        iptables -I OUTPUT -p tcp --dport 587 -j ACCEPT 2>/dev/null || true
        iptables -I OUTPUT -p tcp --dport 465 -j ACCEPT 2>/dev/null || true
        
        echo "⚠️  If still blocked, check DigitalOcean Cloud Firewall:"
        echo "   Dashboard → Networking → Firewalls → Add Outbound Rule for port 587"
    fi
else
    echo "⚠️  'nc' (netcat) not installed, skipping connectivity test"
fi

# 4. Restart PM2 with updated env
echo ""
echo "=== 4. Restarting PM2 with updated environment ==="
pm2 delete gurulink-api 2>/dev/null || true

# Use ecosystem.config.js if it exists and has env_file
if [ -f ecosystem.config.js ] && grep -q "env_file" ecosystem.config.js; then
    echo "Using ecosystem.config.js (with env_file)"
    pm2 start ecosystem.config.js
else
    echo "Starting with direct command and --update-env"
    pm2 start src/index.js --name gurulink-api \
      --cwd "$BACKEND_DIR" \
      --update-env
fi

pm2 save
echo "✅ PM2 restarted"

# 5. Wait and check logs
echo ""
echo "=== 5. Checking email status in logs (waiting 3 seconds) ==="
sleep 3
EMAIL_LOG=$(pm2 logs gurulink-api --lines 30 --nostream 2>/dev/null | grep -i "email\|smtp" || echo "")
if [ -n "$EMAIL_LOG" ]; then
    echo "$EMAIL_LOG"
    if echo "$EMAIL_LOG" | grep -q "ready to send\|SMTP server is ready"; then
        echo "✅ Email is working!"
    elif echo "$EMAIL_LOG" | grep -q "connection failed\|SMTP connection failed"; then
        echo "❌ Email connection failed - check credentials or firewall"
    fi
else
    echo "⚠️  No email logs found yet"
fi

# 6. Test email config with Node.js
echo ""
echo "=== 6. Testing email configuration ==="
if command -v node &> /dev/null; then
    node -e "
require('dotenv').config();
const nodemailer = require('nodemailer');
const smtpHost = process.env.SMTP_HOST || 'smtpout.secureserver.net';
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
const smtpPassword = process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD;
const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;

if (!smtpUser || !smtpPassword) {
    console.log('❌ SMTP credentials missing!');
    process.exit(1);
}

const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    requireTLS: smtpPort === 587 && !smtpSecure,
    auth: {
        user: smtpUser,
        pass: smtpPassword,
    },
    tls: {
        rejectUnauthorized: false,
    },
});

(async () => {
    try {
        await transporter.verify();
        console.log('✅ Email configuration is working!');
        process.exit(0);
    } catch (error) {
        console.log('❌ Email configuration error:', error.message);
        process.exit(1);
    }
})();
" && echo "✅ Node.js email test passed" || echo "❌ Node.js email test failed"
else
    echo "⚠️  Node.js not found, skipping email config test"
fi

echo ""
echo "=========================================="
echo "  Summary"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Check PM2 logs: pm2 logs gurulink-api --lines 50 | grep -i email"
echo "2. Test email sending:"
echo "   curl -X POST http://localhost:4000/api/debug/test-email \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"to\":\"your-email@gmail.com\"}'"
echo ""
echo "If still not working:"
echo "- Check DigitalOcean Cloud Firewall (Dashboard → Networking → Firewalls)"
echo "- Verify SMTP credentials in .env match your email provider"
echo "- Check PM2 environment: pm2 show gurulink-api | grep -A 20 'env:'"
echo "=========================================="



