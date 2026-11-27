-- ============================================================
-- timeline_map_cache 建表脚本
--
-- 用途：时空地图模块缓存表
--   - 缓存 getGenerations / getMigration / getCombinedTimeline 三个接口的聚合输出
--   - 缓存 key = md5(接口名 | familyId | 数据指纹 | 参数)
--   - 数据指纹 = 成员总数 | 最新 update_time（成员变化后指纹变 → 缓存自动失效）
--   - 过期时间 = 写入时间 + 24 小时（TTL）
--
-- 执行时机：部署 timeline-map 模块前执行一次
-- ============================================================

CREATE TABLE IF NOT EXISTS `timeline_map_cache` (
  `cache_key`   VARCHAR(128)   NOT NULL COMMENT '缓存键（md5 哈希值，唯一）',
  `data_json`   JSON           NOT NULL COMMENT '缓存数据（接口聚合输出的 JSON 序列化）',
  `expire_time` DATETIME       NOT NULL COMMENT '过期时间（写入时 DATE_ADD(NOW(), INTERVAL 24 HOUR)）',
  `create_time` DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '写入时间',
  `update_time` DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（ON DUPLICATE KEY UPDATE 时自动刷新）',
  PRIMARY KEY (`cache_key`),
  INDEX `idx_expire_time` (`expire_time`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='时空地图模块聚合数据缓存表（24h TTL，成员变化自动失效）';
