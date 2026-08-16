-- ============================================================
-- 迁移脚本：多端账号统一 - 认证绑定表 + 短信验证码表
-- 背景：现登录以 user.openid 为唯一锚点，无法支撑多凭证/多平台
-- 目标：
--   1. 新建 user_auth_identity（凭证绑定表，一个账户可绑多个登录方式）
--   2. 新建 user_sms_code（手机号验证码登录/绑定用）
--   3. 回填：把存量 user.openid/unionid 迁移为 wechat 绑定，保证老用户无感
-- 设计：
--   - user.openid 列保留（微信支付 JSAPI 依赖），后续继续双写
--   - provider='wechat', provider_uid=openid, unionid=原 user.unionid
-- 幂等：CREATE TABLE IF NOT EXISTS + NOT EXISTS 回填，可重复执行
-- 执行：node run-migration.js migrations/add-user-auth-identity.sql
-- ============================================================

USE `family_genealogy`;

-- ------------------------------------------------------------
-- Step 1: 用户认证绑定表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_auth_identity` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `user_id`      VARCHAR(32)   NOT NULL COMMENT '账户ID(业务数据统一归属)',
  `provider`     VARCHAR(32)   NOT NULL COMMENT '认证提供方: wechat/phone/email/apple/google',
  `provider_uid` VARCHAR(64)   NOT NULL COMMENT '提供方唯一标识: 微信openid/手机号/邮箱/第三方sub',
  `unionid`      VARCHAR(64)   DEFAULT '' COMMENT '微信unionid(仅provider=wechat,用于跨appid合并)',
  `extra`        JSON          DEFAULT NULL COMMENT '扩展信息(JSON)',
  `status`       TINYINT(1)    DEFAULT 1 COMMENT '状态 1-正常 0-已解绑(解绑建议直接删除)',
  `create_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_provider_uid` (`provider`, `provider_uid`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_unionid` (`unionid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户认证绑定表';

-- ------------------------------------------------------------
-- Step 2: 用户短信验证码表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_sms_code` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `phone`       VARCHAR(20)   NOT NULL COMMENT '手机号',
  `scene`       VARCHAR(20)   NOT NULL DEFAULT 'login' COMMENT '场景: login-登录 bind-绑定',
  `code_hash`   VARCHAR(64)   NOT NULL COMMENT '验证码SHA-256哈希',
  `expires_at`  DATETIME      NOT NULL COMMENT '过期时间',
  `attempts`    TINYINT(2)    DEFAULT 0 COMMENT '已尝试次数(>=5 自动作废)',
  `used`        TINYINT(1)    DEFAULT 0 COMMENT '是否已使用 1-是 0-否',
  `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_phone_scene` (`phone`, `scene`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户短信验证码表';

-- ------------------------------------------------------------
-- Step 3: 回填存量微信绑定（老用户无感迁移）
-- ------------------------------------------------------------
INSERT INTO `user_auth_identity` (`user_id`, `provider`, `provider_uid`, `unionid`)
SELECT `id`, 'wechat', `openid`, `unionid`
FROM `user`
WHERE `openid` <> ''
  AND NOT EXISTS (
    SELECT 1 FROM `user_auth_identity` b
    WHERE b.`provider` = 'wechat' AND b.`provider_uid` = `user`.`openid`
  );
