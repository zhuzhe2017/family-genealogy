# ============================================================
# 数字家谱 - 数据库恢复演练脚本
# 用途：验证备份文件可用性，演练 RTO（恢复时间目标）
# 用法：bash scripts/restore-drill.sh <backup_file.sql.gz>
# 示例：bash scripts/restore-drill.sh backups/family_genealogy_20260910_030000.sql.gz
# ============================================================

#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:?请指定备份文件路径，如 backups/family_genealogy_20260910_030000.sql.gz}"
DB_NAME="${DB_NAME:-family_genealogy}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_ROOT_PASSWORD:-${DB_PASSWORD:?请设置 DB_ROOT_PASSWORD 或 DB_PASSWORD}}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-mysql}"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "[drill] ERROR: backup file not found: $BACKUP_FILE" >&2
    exit 1
fi

echo "[$(date '+%F %T')] start restore drill: $BACKUP_FILE"
START_TS=$(date +%s)

# 1. 解压到临时目录
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT
gunzip -c "$BACKUP_FILE" > "$TMP_DIR/restore.sql"
echo "[drill] decompressed: $(du -h "$TMP_DIR/restore.sql" | cut -f1)"

# 2. 创建临时恢复库（避免污染生产库）
RESTORE_DB="${DB_NAME}_drill_$(date +%Y%m%d_%H%M%S)"
echo "[drill] creating temp database: $RESTORE_DB"
docker compose -f "$COMPOSE_FILE" exec -T "$MYSQL_CONTAINER" \
    sh -c "MYSQL_PWD='$DB_PASSWORD' mysql -u '$DB_USER' -e \"CREATE DATABASE $RESTORE_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\""

# 3. 导入备份
echo "[drill] importing..."
docker compose -f "$COMPOSE_FILE" exec -T "$MYSQL_CONTAINER" \
    sh -c "MYSQL_PWD='$DB_PASSWORD' mysql -u '$DB_USER' $RESTORE_DB" < "$TMP_DIR/restore.sql"

# 4. 验证：表数量、关键业务数据
echo "[drill] verifying..."
TABLE_COUNT=$(docker compose -f "$COMPOSE_FILE" exec -T "$MYSQL_CONTAINER" \
    sh -c "MYSQL_PWD='$DB_PASSWORD' mysql -u '$DB_USER' -N -e \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$RESTORE_DB';\"")
echo "[drill] table count: $TABLE_COUNT"

USER_COUNT=$(docker compose -f "$COMPOSE_FILE" exec -T "$MYSQL_CONTAINER" \
    sh -c "MYSQL_PWD='$DB_PASSWORD' mysql -u '$DB_USER' -N -e \"SELECT COUNT(*) FROM $RESTORE_DB.user;\"")
FAMILY_COUNT=$(docker compose -f "$COMPOSE_FILE" exec -T "$MYSQL_CONTAINER" \
    sh -c "MYSQL_PWD='$DB_PASSWORD' mysql -u '$DB_USER' -N -e \"SELECT COUNT(*) FROM $RESTORE_DB.family;\"")
echo "[drill] user count: $USER_COUNT, family count: $FAMILY_COUNT"

# 5. 清理临时库
echo "[drill] cleaning up temp database..."
docker compose -f "$COMPOSE_FILE" exec -T "$MYSQL_CONTAINER" \
    sh -c "MYSQL_PWD='$DB_PASSWORD' mysql -u '$DB_USER' -e \"DROP DATABASE $RESTORE_DB;\""

END_TS=$(date +%s)
DURATION=$((END_TS - START_TS))
echo "[$(date '+%F %T')] drill completed in ${DURATION}s"
echo "[drill] RTO check: $DURATION seconds (target: <= 14400s / 4h)"
