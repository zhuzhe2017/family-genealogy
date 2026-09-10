# ============================================================
# MySQL 数据库每日全量备份脚本（mysqldump + gzip，保留 30 天）
# 适用：已按 docker-compose 部署 MySQL 的宿主机
# 建议：宿主机 crontab 每日 03:00 执行：
#   0 3 * * * cd /path/to/family-genealogy && bash scripts/backup-db.sh >> backups/backup.log 2>&1
#
# 恢复演练（RPO≤24h / RTO≤4h 目标验证）：
#   1. 解压备份：gunzip backups/family_genealogy_YYYYMMDD_HHMMSS.sql.gz
#   2. 导入新库：docker compose exec -T mysql sh -c \
#        "mysql -uroot -p$DB_PASSWORD" < backups/family_genealogy_YYYYMMDD_HHMMSS.sql
#   3. 核对表数量/记录数/关键业务数据后，再切换或归档
# ============================================================

#!/usr/bin/env bash
set -euo pipefail

# ---------- 可配置项 ----------
DB_NAME="${DB_NAME:-family_genealogy}"
# 备份使用 root（需 LOCK TABLES / PROCESS 等权限），业务账号权限不足
DB_USER="${DB_USER:-root}"
# 优先使用 DB_ROOT_PASSWORD（root 密码），回退到 DB_PASSWORD
DB_PASSWORD="${DB_ROOT_PASSWORD:-${DB_PASSWORD:?请在环境变量或 .env 中设置 DB_ROOT_PASSWORD 或 DB_PASSWORD}}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
# 通过 docker compose 执行 mysqldump；如直连数据库可改为 mysql 客户端命令
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-mysql}"

# ---------- 主流程 ----------
mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/${DB_NAME}_${TS}.sql.gz"

echo "[$(date '+%F %T')] start backup: $DB_NAME -> $OUT"

# 单事务导出（InnoDB 一致性快照），含存储过程/触发器
docker compose -f "$COMPOSE_FILE" exec -T "$MYSQL_CONTAINER" \
  sh -c "MYSQL_PWD='$DB_PASSWORD' mysqldump -u '$DB_USER' --single-transaction --quick --routines --triggers '$DB_NAME'" \
  | gzip > "$OUT"

# 校验备份文件非空且为有效 gzip
if [ ! -s "$OUT" ]; then
  echo "[$(date '+%F %T')] ERROR: backup file is empty" >&2
  exit 1
fi
gzip -t "$OUT"
echo "[$(date '+%F %T')] backup ok: $(du -h "$OUT" | cut -f1)"

# 清理过期备份（按修改时间，保留 RETENTION_DAYS 天）
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "[$(date '+%F %T')] cleanup done (keep last $RETENTION_DAYS days)"
echo "[$(date '+%F %T')] current backups:"
ls -lh "$BACKUP_DIR" | grep "${DB_NAME}_" || true
