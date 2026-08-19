-- ============================================================
-- 迁移: 家族"分享加入"模式升级
--   1. family_invitation 新增分享渠道 channel
--   2. 新增海报地址 poster_url（分享海报/小程序码图片）
--   3. 新增分享次数 share_count、加入人数 joined_count
-- 幂等: information_schema 判断列是否存在
-- ============================================================

USE `family_genealogy`;

-- ------------------------------------------------------------
-- 1. channel 分享渠道
-- ------------------------------------------------------------
SET @col_channel := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'family_invitation'
    AND COLUMN_NAME = 'channel'
);
SET @ddl_channel := IF(@col_channel = 0,
  'ALTER TABLE `family_invitation` ADD COLUMN `channel` VARCHAR(20) DEFAULT ''link'' COMMENT ''分享渠道 link-链接 sms-短信 email-邮件 wechat-微信 qrcode-扫码 poster-海报'' AFTER `invite_link`',
  'SELECT 1'
);
PREPARE stmt_channel FROM @ddl_channel;
EXECUTE stmt_channel;
DEALLOCATE PREPARE stmt_channel;

-- ------------------------------------------------------------
-- 2. poster_url 分享海报/小程序码图片地址
-- ------------------------------------------------------------
SET @col_poster := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'family_invitation'
    AND COLUMN_NAME = 'poster_url'
);
SET @ddl_poster := IF(@col_poster = 0,
  'ALTER TABLE `family_invitation` ADD COLUMN `poster_url` VARCHAR(500) DEFAULT '''' COMMENT ''分享海报/小程序码图片URL（/uploads/xxx）'' AFTER `channel`',
  'SELECT 1'
);
PREPARE stmt_poster FROM @ddl_poster;
EXECUTE stmt_poster;
DEALLOCATE PREPARE stmt_poster;

-- ------------------------------------------------------------
-- 3. share_count 分享次数
-- ------------------------------------------------------------
SET @col_share := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'family_invitation'
    AND COLUMN_NAME = 'share_count'
);
SET @ddl_share := IF(@col_share = 0,
  'ALTER TABLE `family_invitation` ADD COLUMN `share_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT ''分享次数'' AFTER `poster_url`',
  'SELECT 1'
);
PREPARE stmt_share FROM @ddl_share;
EXECUTE stmt_share;
DEALLOCATE PREPARE stmt_share;

-- ------------------------------------------------------------
-- 4. joined_count 加入人数
-- ------------------------------------------------------------
SET @col_joined := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'family_invitation'
    AND COLUMN_NAME = 'joined_count'
);
SET @ddl_joined := IF(@col_joined = 0,
  'ALTER TABLE `family_invitation` ADD COLUMN `joined_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT ''通过该邀请加入的人数'' AFTER `share_count`',
  'SELECT 1'
);
PREPARE stmt_joined FROM @ddl_joined;
EXECUTE stmt_joined;
DEALLOCATE PREPARE stmt_joined;

-- 存量邀请默认视为 link 渠道
UPDATE `family_invitation` SET `channel` = 'link' WHERE `channel` = '' OR `channel` IS NULL;
