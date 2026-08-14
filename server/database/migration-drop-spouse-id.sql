-- ============================================================
-- 数据迁移：将 spouse_id 废弃，spouse_info 改为多配偶数组
-- ============================================================
-- 执行前请先备份数据库！
-- 影响范围：
--   1. family_member 基表
--   2. 所有 family_members_{id} 分表
-- ============================================================

-- Step 1: 对于 spouse_id 有值的记录，将其 spouse_id 对应的成员姓名合并到
--         spouse_info 数组中（必须先执行，再删列）
-- ============================================================

-- 1a. 处理基表 family_member（如有数据）
-- 将 spouse_id 对应的姓名转换成 {"name":"xxx"} 并入 spouse_info 数组
UPDATE `family_member` AS m
LEFT JOIN `family_member` AS s ON m.spouse_id = s.id AND s.id != ''
SET m.spouse_info = CASE
  WHEN m.spouse_info IS NOT NULL THEN
    JSON_ARRAY(
      m.spouse_info,
      JSON_OBJECT('name', IFNULL(s.name, ''))
    )
  ELSE
    JSON_ARRAY(JSON_OBJECT('name', IFNULL(s.name, '')))
END
WHERE m.spouse_id IS NOT NULL AND m.spouse_id != '';

-- 1b. 如果 spouse_info 原来不是数组，将其转换为单元素数组
UPDATE `family_member`
SET spouse_info = JSON_ARRAY(spouse_info)
WHERE spouse_info IS NOT NULL
  AND JSON_TYPE(spouse_info) = 'OBJECT';

-- ============================================================
-- Step 2: 删除 spouse_id 列
-- ============================================================
ALTER TABLE `family_member` DROP COLUMN `spouse_id`;

-- ============================================================
-- Step 3: 更新 spouse_info 列的注释
-- ============================================================
ALTER TABLE `family_member`
MODIFY COLUMN `spouse_info` JSON DEFAULT NULL
COMMENT '配偶信息JSON数组：[{name,birthDate,rank,bio,deathDate,deathPlace,longitude,latitude}]';
