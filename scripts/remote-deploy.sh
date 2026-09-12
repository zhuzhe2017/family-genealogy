#!/usr/bin/env bash
# ============================================================
# 远程部署脚本（在目标服务器上通过 SSH 执行）
# 用法：ssh host 'DEPLOY_ENV=staging bash -s' < scripts/remote-deploy.sh
# 可覆盖环境变量：DEPLOY_ENV / STAGING_DIR / PROD_DIR / PROD_BASE_URL
# ============================================================
set -euo pipefail

ENV="${DEPLOY_ENV:-staging}"

case "$ENV" in
  staging)
    DIR="${STAGING_DIR:-/opt/family-genealogy-staging}"
    # 项目名覆盖为独立 staging 项目，避免与生产 project 冲突
    COMPOSE_OPTS=(-p family-genealogy-staging -f docker-compose.yml)
    # staging 使用基础 compose 暴露的端口：web-admin 9527
    HEALTH_URL="http://localhost:9527/api/health"
    ;;
  production)
    DIR="${PROD_DIR:-/opt/family-genealogy}"
    COMPOSE_OPTS=(-f docker-compose.yml -f docker-compose.prod.yml)
    # 生产健康检查默认走公网域名；未配置时回退本地 HTTPS
    HEALTH_URL="${PROD_BASE_URL:-https://localhost}/api/health"
    ;;
  *)
    echo "usage: $0 <staging|production>" >&2
    exit 2
    ;;
esac

echo "[deploy] target=$ENV dir=$DIR"
cd "$DIR"

echo "[deploy] pulling images ..."
docker compose "${COMPOSE_OPTS[@]}" pull

echo "[deploy] starting services ..."
docker compose "${COMPOSE_OPTS[@]}" up -d --remove-orphans

echo "[deploy] health check: $HEALTH_URL"
for i in $(seq 1 30); do
  if curl -sfk "$HEALTH_URL" > /dev/null 2>&1; then
    echo "[deploy] health check OK"
    exit 0
  fi
  sleep 2
done
echo "[deploy] health check FAILED after 60s" >&2
exit 1
