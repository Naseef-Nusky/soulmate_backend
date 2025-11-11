#!/bin/bash
set -e

echo "=== Fixing SMTP DNS Timeout ==="

# 1. Test DNS
echo "1. Testing DNS resolution..."
if timeout 3 nslookup smtpout.secureserver.net > /dev/null 2>&1; then
    echo "✅ DNS resolution working"
else
    echo "❌ DNS resolution failing"
    
    # 2. Fix DNS config
    echo "2. Fixing DNS configuration..."
    cp /etc/resolv.conf /etc/resolv.conf.backup 2>/dev/null || true
    cat > /etc/resolv.conf << 'EOF'
nameserver 8.8.8.8
nameserver 8.8.4.4
nameserver 1.1.1.1
EOF
    echo "   Updated DNS servers to Google DNS"
    
    # 3. Fix firewall
    echo "3. Fixing firewall..."
    if command -v ufw &> /dev/null; then
        ufw allow out 53/udp 2>/dev/null || true
        ufw allow out 53/tcp 2>/dev/null || true
        ufw allow out 587/tcp 2>/dev/null || true
        ufw allow out 465/tcp 2>/dev/null || true
        ufw reload 2>/dev/null || true
    fi
    
    # 4. Test again
    echo "4. Retesting DNS..."
    sleep 2
    if timeout 3 nslookup smtpout.secureserver.net > /dev/null 2>&1; then
        echo "✅ DNS resolution now working!"
    else
        echo "❌ Still failing. Check DigitalOcean Cloud Firewall:"
        echo "   Dashboard → Networking → Firewalls → Add Outbound Rules:"
        echo "   - DNS (UDP port 53)"
        echo "   - DNS (TCP port 53)"
        echo "   - SMTP (TCP port 587)"
    fi
fi

# 5. Test SMTP connectivity
echo "5. Testing SMTP connectivity..."
if timeout 5 nc -vz smtpout.secureserver.net 587 2>&1 | grep -q "succeeded\|open"; then
    echo "✅ SMTP port 587 is reachable"
else
    echo "❌ SMTP port 587 still blocked"
    echo "   Check DigitalOcean Cloud Firewall for port 587"
fi

# 6. Restart backend
echo "6. Restarting backend..."
cd /var/www/gurulink_api
pm2 restart gurulink-api --update-env
sleep 3

# 7. Check logs
echo "7. Checking email status..."
pm2 logs gurulink-api --lines 10 --nostream | grep -i "email\|smtp" || echo "   No email logs yet"

echo ""
echo "=== Done ==="



