-- ============================================================
-- 数字家谱 - 业务账号最小权限授权脚本
-- 用途：为后端应用创建独立账号，替代 root 直连
-- 执行：mysql -h 127.0.0.1 -uroot -p < grant-app-user.sql
--       或 docker compose exec -T mysql sh -c \
--         "mysql -uroot -p$$MYSQL_ROOT_PASSWORD" < server/database/grant-app-user.sql
-- ============================================================

-- 请替换为 .env 中实际值，或临时设置会话变量：
--   SET @db_password = 'your_strong_password';
SET @db_password = COALESCE(@db_password, 'please_replace_with_strong_app_password');

-- 创建业务账号（若已存在则更新密码）
SET @create_user = CONCAT(
  "CREATE USER IF NOT EXISTS 'family_app'@'%' IDENTIFIED BY '", @db_password, "'"
);
PREPARE stmt FROM @create_user;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 授予目标库最小权限（DML + 常规 DDL，无 SUPER/FILE/PROCESS 等管理权限）
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON `family_genealogy`.* TO 'family_app'@'%';

FLUSH PRIVILEGES;

SELECT user, host FROM mysql.user WHERE user = 'family_app';
SHOW GRANTS FOR 'family_app'@'%';
