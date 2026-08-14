# generation_table 表 ER 说明

## 概述

`generation_table`（字辈表）是数字家谱系统中按「姓氏 + 始祖」维度管理字辈序列的数据表，替代了旧的 per-family `family_generation` 表。字辈序列以 JSON 数组形式整体存储，便于按支系统一维护与检索。

## 表结构

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | VARCHAR(32) | PK | 字辈表ID（32位小写hex，由 `crypto.randomBytes(16)` 生成） |
| `surname` | VARCHAR(10) | NOT NULL，2-4 汉字 | 姓氏（如「王」「欧阳」） |
| `founder` | VARCHAR(20) | NOT NULL，2-10 汉字 | 始祖姓名（如「王诩」） |
| `generation_sequence` | JSON | NOT NULL，数组 ≥5 项，每项 1-2 汉字 | 字辈序列，按代顺序排列（如 `["国","运","登","朝","熙"]`） |
| `common_regions` | JSON | NOT NULL，数组 ≥1 项 | 常见分布区域（如 `["浙江","江苏"]`） |
| `create_by` | VARCHAR(50) | DEFAULT '' | 创建人 |
| `status` | TINYINT(1) | DEFAULT 1 | 状态：1-启用，0-禁用 |
| `create_time` | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| `update_time` | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

**索引：**
- `PRIMARY KEY (id)`
- `UNIQUE KEY uk_surname_founder (surname, founder)` — 同一姓氏同一始祖仅允许一条字辈记录
- `INDEX idx_surname (surname)`
- `INDEX idx_status (status)`

## ER 关系图

```
┌─────────────────┐         ┌──────────────────────┐         ┌──────────────────┐
│   sys_surname   │         │   generation_table   │         │     family       │
│ (姓氏字典表)    │         │   (字辈表)           │         │   (家族表)       │
├─────────────────┤         ├──────────────────────┤         ├──────────────────┤
│ id (PK, int)    │ ◄─┐     │ id (PK, varchar32)   │     ┌──►│ id (PK, varchar) │
│ surname         │   │     │ surname (varchar10)  │ ────┼───│ surname_id (FK)  │
│ pinyin          │   │     │ founder (varchar20)  │     │   │ name             │
│ initial         │   │     │ generation_sequence  │     │   │ founder          │
│ ...             │   │     │ common_regions (JSON)│     │   │ ...              │
└─────────────────┘   │     │ create_by            │     │   └──────────────────┘
                      │     │ status               │     │
                      │     │ create_time          │     │
                      │     │ update_time          │     │
                      │     └──────────────────────┘     │
                      │            ▲                      │
                      │            │ 弱关联(surname字符串) │
                      └────────────┘                      │
                          (按 surname 字段                │
                           字符串匹配，无外键)            │
                                                           │
                          family.surname_id ──FK──► sys_surname.id
                          family.founder 为字符串，与 generation_table.founder
                          仅语义对应，无外键约束
```

## 关联关系说明

### generation_table 与 sys_surname（弱关联）

- **关联方式**：通过 `generation_table.surname`（字符串）与 `sys_surname.surname`（字符串）做字符串匹配。
- **不建外键的原因**：
  1. `generation_table` 按「姓氏 + 始祖」组合唯一，同一姓氏可对应多条记录（多个始祖支系），如「王-王诩」「王-王羲之」是不同支系。
  2. 姓氏字典 `sys_surname` 是可选的辅助数据，并非所有姓氏都会预先录入字典；字辈表不应因字典缺失而无法建立。
  3. 保持字辈表的自包含性，便于批量导入与独立维护。

### generation_table 与 family（无直接关联）

- `family` 表通过 `surname_id` 外键关联到 `sys_surname`，`family.founder` 是字符串字段。
- `generation_table` 与 `family` 之间**无外键约束**，仅在业务语义上通过「姓氏 + 始祖」组合对应。
- 小程序端可通过 `family.surname_id → sys_surname.surname → generation_table.surname` 的路径，结合 `family.founder` 匹配 `generation_table.founder` 来查询家族对应的字辈序列。

## 与旧 family_generation 表的差异

| 维度 | 旧 `family_generation` | 新 `generation_table` |
|------|------------------------|------------------------|
| **粒度** | per-family（每个家族一份字辈） | per-surname-founder（每姓氏每始祖一份字辈） |
| **主键** | 自增 int | 32位 hex 字符串 |
| **外键** | `family_id` 外键关联 family 表 | 无外键，`surname` 字符串弱关联 |
| **字辈存储** | 每代一行（gen_index + name + sort_order） | JSON 数组整体存储 `generation_sequence` |
| **同代多字辈** | 通过 sort_order 支持同代多个字辈 | 每代严格 1-2 汉字（单值） |
| **区域信息** | 无 | `common_regions` JSON 数组 |
| **唯一约束** | (family_id, gen_index, sort_order) | (surname, founder) |
| **适用场景** | 单家族细粒度编辑 | 跨家族按姓氏支系统一管理 |

### 重构动机

1. **去冗余**：同一姓氏同一始祖的多个家族原本各自维护重复的字辈序列，现统一为一份。
2. **检索性**：按姓氏/区域检索字辈成为一等公民，支持小程序「按姓氏查字辈」的直达体验。
3. **简化模型**：JSON 数组替代多行结构，减少 JOIN 与聚合开销，前端编辑用 `NDynamicTags` 直观操作。

## 迁移参考

迁移脚本见同目录 `refactor-generation-table.sql`（DROP 旧表 + CREATE 新表 + 权限/菜单种子，幂等执行）。
