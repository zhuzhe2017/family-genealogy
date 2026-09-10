#!/usr/bin/env bash
# ============================================================
# 数字家谱 - 环境变量快速配置脚本
# 用途：交互式生成强随机密钥，写入 .env
# 用法：bash scripts/setup-env.sh
# ============================================================
set -euo pipefail

ENV_FILE="${1:-.env}"
ENV_EXAMPLE=".env.example"

if [ ! -f "$ENV_EXAMPLE" ]; then
    echo "ERROR: 未找到 $ENV_EXAMPLE" >&2
    exit 1
fi

echo "=========================================="
echo "数字家谱环境变量配置"
echo "=========================================="
echo ""

# 复制模板
if [ -f "$ENV_FILE" ]; then
    read -p "$ENV_FILE 已存在，是否覆盖? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "已取消"
        exit 0
    fi
fi
cp "$ENV_EXAMPLE" "$ENV_FILE"
echo "[setup] 已复制 $ENV_EXAMPLE -> $ENV_FILE"

# 生成强随机密钥的函数
generate_secret() {
    openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 64
}

# ---------- 数据库配置 ----------
echo ""
echo "---- 数据库配置 ----"
read -p "请输入 MySQL root 密码（留空自动生成）: " DB_ROOT_PASSWORD
if [ -z "$DB_ROOT_PASSWORD" ]; then
    DB_ROOT_PASSWORD=$(generate_secret)
    echo "[setup] 已生成 root 密码: $DB_ROOT_PASSWORD"
fi

read -p "请输入业务账号密码（留空自动生成）: " DB_PASSWORD
if [ -z "$DB_PASSWORD" ]; then
    DB_PASSWORD=$(generate_secret)
    echo "[setup] 已生成业务账号密码: $DB_PASSWORD"
fi

sed -i "s|DB_ROOT_PASSWORD=.*|DB_ROOT_PASSWORD=$DB_ROOT_PASSWORD|" "$ENV_FILE"
sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=$DB_PASSWORD|" "$ENV_FILE"

# ---------- JWT 密钥 ----------
echo ""
echo "---- JWT 配置 ----"
JWT_SECRET=$(generate_secret)
sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$ENV_FILE"
echo "[setup] 已生成 JWT_SECRET: $JWT_SECRET"

# ---------- 云存储加密密钥 ----------
CLOUD_STORAGE_ENCRYPT_SECRET=$(generate_secret)
sed -i "s|CLOUD_STORAGE_ENCRYPT_SECRET=.*|CLOUD_STORAGE_ENCRYPT_SECRET=$CLOUD_STORAGE_ENCRYPT_SECRET|" "$ENV_FILE"
echo "[setup] 已生成 CLOUD_STORAGE_ENCRYPT_SECRET: $CLOUD_STORAGE_ENCRYPT_SECRET"

# ---------- 域名配置 ----------
echo ""
echo "---- 域名配置 ----"
read -p "请输入生产域名（默认: jiapuadmin.deejee.net）: " DOMAIN
DOMAIN=${DOMAIN:-jiapuadmin.deejee.net}

sed -i "s|CORS_ORIGINS=.*|CORS_ORIGINS=https://$DOMAIN|" "$ENV_FILE"
sed -i "s|WX_PAY_NOTIFY_URL=.*|WX_PAY_NOTIFY_URL=https://$DOMAIN/api/subscription/pay/notify|" "$ENV_FILE"
echo "[setup] 已配置域名: $DOMAIN"

# ---------- 微信小程序 ----------
echo ""
echo "---- 微信小程序 ----"
read -p "请输入 WX_APPID（留空跳过）: " WX_APPID
if [ -n "$WX_APPID" ]; then
    sed -i "s|WX_APPID=.*|WX_APPID=$WX_APPID|" "$ENV_FILE"
    read -p "请输入 WX_SECRET: " WX_SECRET
    sed -i "s|WX_SECRET=.*|WX_SECRET=$WX_SECRET|" "$ENV_FILE"
fi

# ---------- 微信支付 ----------
echo ""
echo "---- 微信支付 ----"
read -p "请输入 WX_MCH_ID（留空跳过）: " WX_MCH_ID
if [ -n "$WX_MCH_ID" ]; then
    sed -i "s|WX_MCH_ID=.*|WX_MCH_ID=$WX_MCH_ID|" "$ENV_FILE"
    read -p "请输入 WX_MCH_SERIAL_NO: " WX_MCH_SERIAL_NO
    sed -i "s|WX_MCH_SERIAL_NO=.*|WX_MCH_SERIAL_NO=$WX_MCH_SERIAL_NO|" "$ENV_FILE"
    read -p "请输入 WX_MCH_PRIVATE_KEY: " WX_MCH_PRIVATE_KEY
    sed -i "s|WX_MCH_PRIVATE_KEY=.*|WX_MCH_PRIVATE_KEY=$WX_MCH_PRIVATE_KEY|" "$ENV_FILE"
    read -p "请输入 WX_PAY_API_V3_KEY: " WX_PAY_API_V3_KEY
    sed -i "s|WX_PAY_API_V3_KEY=.*|WX_PAY_API_V3_KEY=$WX_PAY_API_V3_KEY|" "$ENV_FILE"
fi

# ---------- 完成 ----------
echo ""
echo "=========================================="
echo "配置完成！"
echo "=========================================="
echo ""
echo "配置文件: $ENV_FILE"
echo ""
echo "请检查以下关键配置:"
grep -E "^(DB_ROOT_PASSWORD|DB_PASSWORD|JWT_SECRET|CLOUD_STORAGE_ENCRYPT_SECRET|CORS_ORIGINS)=" "$ENV_FILE" | sed 's/=.*/=***/'
echo ""
echo "下一步:"
echo "1. 启动数据库: docker compose up -d mysql"
echo "2. 初始化 schema: docker compose exec -T mysql sh -c 'mysql -uroot -p\$DB_ROOT_PASSWORD' < server/database/schema.sql"
echo "3. 创建业务账号: docker compose exec -T mysql sh -c 'mysql -uroot -p\$DB_ROOT_PASSWORD' < server/database/grant-app-user.sql"
echo "4. 启动全部服务: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"
