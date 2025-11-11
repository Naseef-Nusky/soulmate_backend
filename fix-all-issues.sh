#!/bin/bash
set -e

echo "=========================================="
echo "  Fixing All Production Issues"
echo "=========================================="

BACKEND_DIR="/var/www/gurulink_api"
cd "$BACKEND_DIR" || exit 1

# 1. Fix SMTP Firewall
echo ""
echo "=== 1. Fixing SMTP Firewall ==="
if timeout 5 nc -vz smtpout.secureserver.net 587 2>&1 | grep -q "succeeded\|open"; then
    echo "✅ SMTP port 587 is reachable"
else
    echo "❌ SMTP port 587 is blocked - fixing..."
    
    # Fix UFW
    if command -v ufw &> /dev/null; then
        ufw allow out 587/tcp 2>/dev/null || true
        ufw allow out 465/tcp 2>/dev/null || true
        ufw reload 2>/dev/null || true
    fi
    
    # Fix iptables
    iptables -I OUTPUT -p tcp --dport 587 -j ACCEPT 2>/dev/null || true
    iptables -I OUTPUT -p tcp --dport 465 -j ACCEPT 2>/dev/null || true
    
    echo "⚠️  If still blocked, check DigitalOcean Cloud Firewall:"
    echo "   Dashboard → Networking → Firewalls → Add Outbound Rule for port 587"
fi

# 2. Check and Fix .env file
echo ""
echo "=== 2. Checking .env file ==="
if [ ! -f .env ]; then
    echo "❌ .env file missing! Creating template..."
    cat > .env << 'ENVEOF'
PORT=4000
NODE_ENV=production
APP_URL=https://gurulink.app

# Database (UPDATE THIS!)
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require

# SMTP Settings
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=soulmate@gurulink.app
SMTP_PASSWORD=CHANGE_ME
EMAIL_FROM=soulmate@gurulink.app

# AI Keys
GEMINI_API_KEY=your_key_here
ENVEOF
    echo "⚠️  Please edit .env and set DATABASE_URL and SMTP_PASSWORD"
    echo "   nano .env"
    exit 1
fi

# 3. Check DATABASE_URL
echo ""
echo "=== 3. Checking DATABASE_URL ==="
if grep -q "^DATABASE_URL=" .env && ! grep "^DATABASE_URL=" .env | grep -q "CHANGE_ME\|your_database"; then
    echo "✅ DATABASE_URL is set"
    # Test database connection
    echo "   Testing database connection..."
    node -e "
    require('dotenv').config();
    const { Pool } = require('pg');
    try {
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        pool.query('SELECT 1').then(() => {
            console.log('   ✅ Database connection successful');
            process.exit(0);
        }).catch(e => {
            console.log('   ❌ Database connection failed:', e.message);
            process.exit(1);
        });
    } catch (e) {
        console.log('   ❌ Error:', e.message);
        process.exit(1);
    }
    " 2>&1 || echo "   ⚠️  Database connection test failed"
else
    echo "❌ DATABASE_URL not set or using placeholder"
    echo "   Please edit .env and set DATABASE_URL"
fi

# 4. Check SMTP credentials
echo ""
echo "=== 4. Checking SMTP credentials ==="
if grep -q "^SMTP_USER=" .env && grep -q "^SMTP_PASSWORD=" .env; then
    SMTP_PASS=$(grep "^SMTP_PASSWORD=" .env | cut -d'=' -f2- | sed 's/^"//;s/"$//')
    if [ -n "$SMTP_PASS" ] && [ "$SMTP_PASS" != "CHANGE_ME" ] && [ "$SMTP_PASS" != "your_password_here" ]; then
        echo "✅ SMTP credentials are set"
    else
        echo "❌ SMTP_PASSWORD not set or using placeholder"
    fi
else
    echo "❌ SMTP_USER or SMTP_PASSWORD missing"
fi

# 5. Restart PM2 with updated environment
echo ""
echo "=== 5. Restarting PM2 ==="
pm2 delete gurulink-api 2>/dev/null || true

if [ -f ecosystem.config.js ]; then
    pm2 start ecosystem.config.js
else
    pm2 start src/index.js --name gurulink-api \
      --cwd "$BACKEND_DIR" \
      --update-env
fi

pm2 save

# 6. Wait and check logs
echo ""
echo "=== 6. Checking status (waiting 5 seconds) ==="
sleep 5

echo "Recent logs:"
pm2 logs gurulink-api --lines 20 --nostream | tail -10

echo ""
echo "=========================================="
echo "  Summary"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. If DATABASE_URL is missing, edit .env:"
echo "   nano /var/www/gurulink_api/.env"
echo ""
echo "2. If SMTP still timing out, check DigitalOcean Cloud Firewall:"
echo "   Dashboard → Networking → Firewalls → Add Outbound Rule for port 587"
echo ""
echo "3. Check logs:"
echo "   pm2 logs gurulink-api --lines 50"
echo ""
echo "=========================================="



