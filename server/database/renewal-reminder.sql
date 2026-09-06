USE `family_genealogy`;

-- ------------------------------------------------------------
-- 订阅续费提醒埋点表：记录每个家族在每个提醒节点的发送状态
-- （T-30 / T-14 / T-7 / T-1 / grace-3），防止重复推送
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subscription_renewal_reminder` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `family_id`  INT UNSIGNED NOT NULL COMMENT '家族ID',
  `node`       VARCHAR(10)  NOT NULL COMMENT '提醒节点: T-30/T-14/T-7/T-1/G-3',
  `sent_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_family_node` (`family_id`, `node`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订阅续费提醒发送记录';
