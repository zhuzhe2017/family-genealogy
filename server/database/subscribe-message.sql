-- 微信订阅消息授权记录表
-- 用户通过 wx.requestSubscribeMessage 授权后，由后端记录授权关系
-- 每次授权可增加一次发送额度（微信规则：用户每授权一次，开发者可发送一次）
CREATE TABLE IF NOT EXISTS `user_subscribe_message` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `user_id`     VARCHAR(32)  NOT NULL COMMENT '用户ID',
  `openid`      VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '微信openid（冗余备份）',
  `tmpl_id`     VARCHAR(64)  NOT NULL COMMENT '订阅消息模板ID',
  `scene`       VARCHAR(32)  NOT NULL DEFAULT 'renewal_reminder' COMMENT '业务场景：renewal_reminder-续费提醒',
  `status`      TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '状态：1-可用 0-已用完/失效',
  `used_at`     DATETIME     DEFAULT NULL COMMENT '发送使用时间（用完即失效）',
  `expire_at`   DATETIME     DEFAULT NULL COMMENT '授权过期时间（微信侧最长7天）',
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_scene` (`user_id`, `scene`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='微信订阅消息授权记录表';
