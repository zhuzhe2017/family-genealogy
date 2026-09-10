# ============================================================
# 数字家谱 - 备份文件异地同步脚本
# 用途：将本地 backups/ 目录每日同步到腾讯云 COS，实现异地容灾
# 依赖：coscmd（pip install coscmd）或腾讯云 CLI
# 配置：export COS_BUCKET=family-genealogy-backups-1234567890
#        export COS_REGION=ap-guangzhou
#        export COS_SECRET_ID=xxx
#        export COS_SECRET_KEY=xxx
# 建议：宿主机 crontab 每日 04:00 执行（备份完成后 1 小时）：
#   0 4 * * * cd /path/to/family-genealogy && bash scripts/sync-backup-cos.sh >> backups/sync.log 2>&1
# ============================================================

#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
COS_BUCKET="${COS_BUCKET:?请设置 COS_BUCKET（如 family-genealogy-backups-1234567890）}"
COS_REGION="${COS_REGION:-ap-guangzhou}"

# 检查 coscmd 是否安装
if ! command -v coscmd &> /dev/null; then
    echo "[sync] ERROR: coscmd not found. Install: pip install coscmd" >&2
    exit 1
fi

echo "[$(date '+%F %T')] start sync: $BACKUP_DIR -> cos://$COS_BUCKET/backups/"

# 增量同步（仅上传新增/变更的文件）
coscmd config -a "${COS_SECRET_ID:?}" -s "${COS_SECRET_KEY:?}" -b "$COS_BUCKET" -r "$COS_REGION"
coscmd upload -r "$BACKUP_DIR" "/backups/"

echo "[$(date '+%F %T')] sync done"
