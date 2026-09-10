#!/usr/bin/env bash
# ============================================================
# 数字家谱 - 生产服务器一键初始化脚本
# 适用：Ubuntu 20.04/22.04 / CentOS 7.9+
# 用法：bash scripts/init-server.sh
#       curl -fsSL https://raw.githubusercontent.com/your-repo/main/scripts/init-server.sh | bash
# ============================================================
set -euo pipefail

echo "=========================================="
echo "数字家谱生产服务器初始化"
echo "=========================================="

# ---------- 检测操作系统 ----------
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VER=$VERSION_ID
else
    echo "ERROR: 无法检测操作系统" >&2
    exit 1
fi
echo "[init] 检测到操作系统: $OS $VER"

# ---------- 1. 系统更新 ----------
echo ""
echo "[1/8] 系统更新..."
if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    apt-get update -y
    apt-get upgrade -y
    apt-get install -y curl wget git vim htop ufw
elif [[ "$OS" == "centos" || "$OS" == "rhel" ]]; then
    yum update -y
    yum install -y curl wget git vim htop firewalld
    systemctl enable firewalld
    systemctl start firewalld
else
    echo "ERROR: 不支持的操作系统: $OS" >&2
    exit 1
fi

# ---------- 2. 安装 Docker ----------
echo ""
echo "[2/8] 安装 Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | bash
    systemctl enable docker
    systemctl start docker
else
    echo "[init] Docker 已安装，跳过"
fi

# 安装 Docker Compose 插件
if ! docker compose version &> /dev/null; then
    echo "[init] 安装 Docker Compose 插件..."
    DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep tag_name | cut -d '"' -f 4)
    curl -SL "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
fi

# 配置 Docker 镜像加速（可选，国内服务器建议配置）
if [[ ! -f /etc/docker/daemon.json ]]; then
    echo "[init] 配置 Docker 镜像加速..."
    mkdir -p /etc/docker
    cat > /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com",
    "https://docker.mirrors.ustc.edu.cn"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
EOF
    systemctl restart docker
fi

# ---------- 3. 安装 Node.js + pnpm（备用，非容器构建时需要）----------
echo ""
echo "[3/8] 安装 Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
    if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    elif [[ "$OS" == "centos" || "$OS" == "rhel" ]]; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
        yum install -y nodejs
    fi
else
    echo "[init] Node.js 已安装: $(node -v)"
fi

if ! command -v pnpm &> /dev/null; then
    npm install -g pnpm@10
fi
echo "[init] pnpm 版本: $(pnpm -v)"

# ---------- 4. 配置防火墙 ----------
echo ""
echo "[4/8] 配置防火墙..."
if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow 22/tcp comment "SSH"
    ufw allow 80/tcp comment "HTTP"
    ufw allow 443/tcp comment "HTTPS"
    ufw --force enable
    echo "[init] ufw 状态:"
    ufw status
elif [[ "$OS" == "centos" || "$OS" == "rhel" ]]; then
    firewall-cmd --permanent --add-service=ssh
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --reload
    echo "[init] firewalld 状态:"
    firewall-cmd --list-all
fi

# ---------- 5. 创建部署目录 ----------
echo ""
echo "[5/8] 创建部署目录..."
DEPLOY_PATH="/opt/family-genealogy"
mkdir -p "$DEPLOY_PATH"/{ssl,backups}
cd "$DEPLOY_PATH"

if [ ! -f .env ]; then
    cp .env.example .env
    echo "[init] 已创建 $DEPLOY_PATH/.env，请编辑配置:"
    echo "  - DB_ROOT_PASSWORD / DB_PASSWORD"
    echo "  - JWT_SECRET"
    echo "  - CLOUD_STORAGE_ENCRYPT_SECRET"
    echo "  - CORS_ORIGINS=https://jiapuadmin.deejee.net"
else
    echo "[init] .env 已存在，跳过"
fi

# ---------- 6. 配置时区 ----------
echo ""
echo "[6/8] 配置时区..."
timedatectl set-timezone Asia/Shanghai
echo "[init] 当前时间: $(date)"

# ---------- 7. 配置日志轮转 ----------
echo ""
echo "[7/8] 配置日志轮转..."
cat > /etc/logrotate.d/docker-containers <<'EOF'
/var/lib/docker/containers/*/*.log {
    rotate 7
    daily
    compress
    size=50M
    missingok
    delaycompress
    copytruncate
}
EOF
echo "[init] Docker 容器日志轮转已配置"

# ---------- 8. 配置 Swap（内存不足时）----------
echo ""
echo "[8/8] 检查内存..."
MEM_TOTAL=$(free -m | awk '/^Mem:/{print $2}')
if [ "$MEM_TOTAL" -lt 4096 ]; then
    echo "[init] 内存 ${MEM_TOTAL}MB，建议配置 Swap..."
    if [ ! -f /swapfile ]; then
        fallocate -l 2G /swapfile
        chmod 600 /swapfile
        mkswap /swapfile
        swapon /swapfile
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
        echo "[init] Swap 已配置: 2G"
    fi
else
    echo "[init] 内存充足: ${MEM_TOTAL}MB，跳过 Swap"
fi

# ---------- 完成 ----------
echo ""
echo "=========================================="
echo "初始化完成！"
echo "=========================================="
echo ""
echo "后续步骤:"
echo "1. 编辑环境变量: vim $DEPLOY_PATH/.env"
echo "2. 生成强随机密钥:"
echo "   openssl rand -base64 48  # JWT_SECRET"
echo "   openssl rand -base64 48  # CLOUD_STORAGE_ENCRYPT_SECRET"
echo "3. 上传 SSL 证书到 $DEPLOY_PATH/ssl/"
echo "4. 初始化数据库:"
echo "   docker compose up -d mysql"
echo "   docker compose exec -T mysql sh -c 'mysql -uroot -p\$DB_ROOT_PASSWORD' < server/database/schema.sql"
echo "   docker compose exec -T mysql sh -c 'mysql -uroot -p\$DB_ROOT_PASSWORD' < server/database/grant-app-user.sql"
echo "5. 启动全部服务:"
echo "   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"
echo "6. 配置每日备份 crontab:"
echo "   0 3 * * * cd $DEPLOY_PATH && bash scripts/backup-db.sh >> backups/backup.log 2>&1"
echo ""
echo "域名解析: jiapuadmin.deejee.net -> $(curl -s ifconfig.me 2>/dev/null || echo '106.54.52.45')"
