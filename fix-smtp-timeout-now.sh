#!/bin/bash
set -e

echo "=== Fixing SMTP Connection Timeout ==="

# 1. Test connectivity
echo "1. Testing SMTP connectivity..."
if timeout 5 nc -vz smtpout.secureserver.net 587 2>&1 | grep -q "succeeded\|open"; then
    echo "✅ SMTP port 587 is already reachable"
else
    echo "❌ SMTP port 587 is blocked"
    
    # 2. Fix UFW
    echo "2. Fixing UFW firewall..."
    if command -v ufw &> /dev/null; then
        ufw allow out 587/tcp 2>/dev/null || true
        ufw allow out 465/tcp 2>/dev/null || true
        ufw reload 2>/dev/null || true
        echo "   UFW rules updated"
    fi
    
    # 3. Fix iptables
    echo "3. Fixing iptables..."
    iptables -I OUTPUT -p tcp --dport 587 -j ACCEPT 2>/dev/null || true
    iptables -I OUTPUT -p tcp --dport 465 -j ACCEPT 2>/dev/null || true
    iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
    echo "   iptables rules updated"
    
    # 4. Test again
    echo "4. Retesting..."
    sleep 2
    if timeout 5 nc -vz smtpout.secureserver.net 587 2>&1 | grep -q "succeeded\|open"; then
        echo "✅ SMTP port 587 is now reachable!"
    else
        echo "❌ Still blocked. MUST fix DigitalOcean Cloud Firewall:"
        echo "   Dashboard → Networking → Firewalls → Add Outbound Rule for port 587"
        exit 1
    fi
fi

# 5. Restart backend
echo "5. Restarting backend..."
cd /var/www/gurulink_api
pm2 restart gurulink-api --update-env
sleep 3

# 6. Check logs
echo "6. Checking email status..."
pm2 logs gurulink-api --lines 10 --nostream | grep -i "email\|smtp" || echo "   No email logs yet"

echo ""
echo "=== Done ==="
echo "If still not working, check DigitalOcean Cloud Firewall!"



