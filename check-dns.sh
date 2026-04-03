#!/bin/bash
SERVER_IP="81.91.177.204"
MAIN_IP=$(nslookup googlegum.ru 1.1.1.1 | grep -A1 'Name:' | grep 'Address' | awk '{print $2}' | tail -1)
APP_IP=$(nslookup app.googlegum.ru 1.1.1.1 | grep -A1 'Name:' | grep 'Address' | awk '{print $2}' | tail -1)
if [ "$MAIN_IP" = "$SERVER_IP" ] && [ "$APP_IP" = "$SERVER_IP" ]; then
    certbot --nginx -d googlegum.ru -d www.googlegum.ru -d app.googlegum.ru --non-interactive --agree-tos -m admin@googlegum.ru --redirect 2>&1
    pm2 restart alpha-planner
    crontab -l | grep -v 'check-dns.sh' | crontab -
    echo "SSL issued for googlegum.ru at $(date)" >> /var/log/alpha-dns.log
fi
