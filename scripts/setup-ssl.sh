#!/usr/bin/env bash
# ============================================================
# 数字家谱 - SSL 证书申请脚本（Let's Encrypt）
# 用途：自动申请/续期域名 SSL 证书
# 前提：域名已解析到本服务器，Docker 已安装
# 用法：bash scripts/setup-ssl.sh <domain>
# 示例：bash scripts/setup-ssl.sh jiapuadmin.deejee.net
# ============================================================
set -euo pipefail

DOMAIN="${1:?请指定域名，如: bash scripts/setup-ssl.sh jiapuadmin.deejee.net}"
EMAIL="${2:-admin@$DOMAIN}"   # 证书过期提醒邮箱
SSL_DIR="./ssl"

echo "=========================================="
echo "SSL 证书申请: $DOMAIN"
echo "=========================================="
echo ""

# 检查域名解析
echo "[ssl] 检查域名解析..."
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ip.sb 2>/dev/null || echo "")
DOMAIN_IP=$(dig +short "$DOMAIN" 2>/dev/null | tail -n1 || nslookup "$DOMAIN" 2>/dev/null | grep -oP '\d+\.\d+\.\d+\.\d+' | tail -n1 || echo "")

if [ -z "$DOMAIN_IP" ]; then
    echo "WARNING: 无法解析域名 $DOMAIN，请确认域名已解析到本服务器 ($SERVER_IP)"
    read -p "是否继续? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "[ssl] 域名解析: $DOMAIN -> $DOMAIN_IP"
    if [ -n "$SERVER_IP" ] && [ "$DOMAIN_IP" != "$SERVER_IP" ]; then
        echo "WARNING: 域名解析 IP ($DOMAIN_IP) 与本服务器 IP ($SERVER_IP) 不一致"
        read -p "是否继续? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

# 创建 SSL 目录
mkdir -p "$SSL_DIR"
cd "$SSL_DIR"

# 使用 certbot 申请证书
echo ""
echo "[ssl] 启动 certbot 容器申请证书..."
docker run --rm -it \
    -v "$(pwd)/letsencrypt:/etc/letsencrypt" \
    -v "$(pwd)/www:/var/www/certbot" \
    certbot/certbot certonly \
    --webroot \
    -w /var/www/certbot \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email

# 复制证书到标准路径
if [ -f "letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    cp "letsencrypt/live/$DOMAIN/fullchain.pem" "$DOMAIN.crt"
    cp "letsencrypt/live/$DOMAIN/privkey.pem" "$DOMAIN.key"
    chmod 644 "$DOMAIN.crt"
    chmod 600 "$DOMAIN.key"
    echo ""
    echo "=========================================="
    echo "证书申请成功！"
    echo "=========================================="
    echo "证书文件:"
    echo "  $SSL_DIR/$DOMAIN.crt"
    echo "  $SSL_DIR/$DOMAIN.key"
    echo ""
    echo "有效期:"
    openssl x509 -in "$DOMAIN.crt" -noout -dates
    echo ""
    echo "下一步:"
    echo "1. 更新 docker-compose.prod.yml 中的证书路径:"
    echo "   - ./ssl/$DOMAIN.crt:/etc/nginx/ssl/server.crt:ro"
    echo "   - ./ssl/$DOMAIN.key:/etc/nginx/ssl/server.key:ro"
    echo "2. 重启服务:"
    echo "   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
else
    echo "ERROR: 证书申请失败" >&2
    exit 1
fi

# 配置自动续期
echo ""
echo "[ssl] 配置自动续期..."
cat > /etc/cron.d/certbot-renew <<EOF
0 3 1 * * root cd $(pwd) && docker run --rm -v $(pwd)/letsencrypt:/etc/letsencrypt -v $(pwd)/www:/var/www/certbot certbot/certbot renew --quiet && cp letsencrypt/live/$DOMAIN/fullchain.pem $DOMAIN.crt && cp letsencrypt/live/$DOMAIN/privkey.pem $DOMAIN.key && docker compose -f ../docker-compose.yml -f ../docker-compose.prod.yml restart web-admin tenant-web
EOF
echo "[ssl] 已添加 crontab: 每月 1 日 03:00 自动续期"
