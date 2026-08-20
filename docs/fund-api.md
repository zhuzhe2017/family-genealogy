# 家族基金模块 — 接口与数据结构文档

> 模块代号：fund ｜ 服务端：`server/src/fund` ｜ 迁移脚本：`server/database/migrations/20260820-family-fund.sql`
> 用户端（小程序）路由前缀：`/user/fund`；统一使用 `UserJwtAuthGuard`（Bearer Token）。

---

## 一、数据结构

### 1. `family_fund` 家族基金主表（每家族唯一）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | INT UNSIGNED | 主键 |
| family_id | INT UNSIGNED | 所属家族（唯一键 uk_fund_family） |
| name | VARCHAR(50) | 基金名称 |
| logo_url / description | VARCHAR | 图标 / 简介 |
| total_amount | DECIMAL(12,2) | **公共池**当前总额（元） |
| single_deposit_limit / single_withdraw_limit | DECIMAL(12,2) | 单次存入 / 取出限额 |
| daily_deposit_limit / daily_withdraw_limit | DECIMAL(12,2) | 每日存入 / 取出限额 |
| monthly_deposit_limit / monthly_withdraw_limit | DECIMAL(12,2) | 每月存入 / 取出限额 |
| withdraw_approval_threshold | DECIMAL(12,2) | 大额取出审批阈值（默认 500） |
| need_approval | TINYINT(1) | 是否需审批 1-是 0-否 |
| status | TINYINT(1) | 1-正常 2-已解散 |
| creator_user_id | VARCHAR(32) | 创建人（自动为族长） |
| dissolved_at / dissolve_reason | - | 解散时间 / 原因 |

### 2. `family_fund_member` 基金成员权限表

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| fund_id / family_id | - | 归属 |
| user_id | VARCHAR(32) | 用户（唯一键 uk_fund_user） |
| member_id / name | VARCHAR | 家族成员ID / 姓名（冗余展示） |
| role | VARCHAR(20) | `leader` 族长 / `admin` 管理员 / `member` 普通成员 |
| permissions | JSON | 权限码数组 |
| balance | DECIMAL(12,2) | **个人净余额**（存入 +，取出/转出 -） |
| status | TINYINT(1) | 1-正常 0-已移除 |

### 3. `family_fund_transaction` 资金交易流水表（唯一事实来源）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| fund_id / family_id | - | 归属 |
| type | VARCHAR(20) | `init` 创建初始化 / `deposit` 存入 / `withdraw` 取出 / `transfer` 转账 / `adjust` 族长调账 |
| amount | DECIMAL(12,2) | 金额（正数） |
| direction | TINYINT(1) | 1-流入 -1-流出 |
| operator_user_id | VARCHAR(32) | 操作人 |
| target_user_id | VARCHAR(32) | 对方（转账接收方） |
| payment_method | VARCHAR(20) | `cash` 现金 / `wechat` 微信 / `alipay` 支付宝 / `bank` 银行转账 |
| status | TINYINT(1) | **1-成功 0-失败 2-待审批 3-已驳回** |
| balance_after | DECIMAL(12,2) | 操作后公共池余额（成功流水） |
| approve_user_id / approve_time / approve_remark | - | 审批人 / 时间 / 备注 |

---

## 二、角色与权限

### 权限码（permissions JSON 数组）

| 码 | 说明 | 默认族长 | 默认管理员 | 默认普通成员 |
| --- | --- | :---: | :---: | :---: |
| deposit | 存入 | ✅ | ✅ | ✅ |
| withdraw | 取出 | ✅ | ✅ | ❌ |
| transfer | 转账 | ✅ | ✅ | ❌ |
| view_all | 查看全部明细 | ✅ | ✅ | ❌ |
| approve | 审批大额取出 | ✅ | ✅ | ❌ |
| manage_member | 成员权限管理 | ✅ | ✅ | ❌ |
| manage_rule | 基金规则设置 | ✅ | ❌ | ❌ |
| dissolve | 解散基金 | ✅ | ❌ | ❌ |

- **族长** = 基金创建人 或 家族创建者 或 家族管理员（`family_permission.role='admin'`），恒具全部权限，不可被修改/移除。
- 未加入成员名单的家族成员默认仅具 `deposit` 权限（首次存入自动建行）。
- 查看成员列表：具 `view_all` 或 `transfer` 权限可见全部，否则仅本人。

### 经济平衡规则（限额）

- 存入：单次 ≤ `single_deposit_limit`；当日累计 ≤ `daily_deposit_limit`；当月累计 ≤ `monthly_deposit_limit`（计入成功存入流水）。
- 取出/转账：单次 ≤ `single_withdraw_limit`；当日/当月累计 ≤ 对应取出限额（计入取出成功+待审批流水及转账转出）。
- 大额取出：`amount > withdraw_approval_threshold` 且 `need_approval=1` → 流水置 `status=2`（不扣余额），由具 `approve` 权限者审批；通过扣减公共池与个人余额，驳回置 `status=3`。
- 转账仅转移个人余额（`A.balance -= amount`，`B.balance += amount`），公共池不变；接收人必须已在基金成员名单。
- 调账（族长）直接增减公共池，不限额。
- 解散前置条件：公共池余额必须为 0。

---

## 三、接口列表

统一响应：`{ code: '0000', data, msg }`；错误为 400/403/404 + msg。

| # | 方法与路径 | 权限 | 参数 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | `GET /user/fund/info?familyId=` | 家族成员 | - | 基金信息 + 我的角色/权限（无基金 `hasFund=false`） |
| 2 | `POST /user/fund?familyId=` | 家族成员 | name*, description?, initAmount?, 限额×7?, needApproval? | 创建基金（每家族唯一） |
| 3 | `PUT /user/fund/settings?familyId=` | manage_rule | name?, description?, 限额×7?, needApproval? | 更新基本信息与限额 |
| 4 | `GET /user/fund/members?familyId=` | view_all/transfer | - | 成员列表（角色/权限/个人余额） |
| 5 | `POST /user/fund/members?familyId=` | manage_member | memberId? 或 userId?, name? | 添加成员（memberId 反查已绑定账号） |
| 6 | `PUT /user/fund/members/:userId?familyId=` | manage_member | role?, permissions? | 更新角色/权限（族长不可改） |
| 7 | `DELETE /user/fund/members/:userId?familyId=` | manage_member | - | 移除成员（余额为 0 方可） |
| 8 | `POST /user/fund/deposit?familyId=` | deposit | amount*, paymentMethod?, remark? | 存入 |
| 9 | `POST /user/fund/withdraw?familyId=` | withdraw | amount*, paymentMethod?, remark? | 取出（超阈值转待审批） |
| 10 | `POST /user/fund/transfer?familyId=` | transfer | amount*, targetUserId*, remark? | 成员间转账 |
| 11 | `POST /user/fund/adjust?familyId=` | 族长 | amount*, direction* (1/-1), remark? | 调账 |
| 12 | `POST /user/fund/transactions/:txId/approve?familyId=` | approve | approved* (true/false), remark? | 审批大额取出 |
| 13 | `GET /user/fund/transactions?familyId=&type=&status=&userId=&startDate=&endDate=&page=&pageSize=` | 本人/view_all | 多维筛选 | 明细分页，附带 income/expense 汇总（对账） |
| 14 | `GET /user/fund/stats?familyId=` | 家族成员 | - | 余额/今日/本月收支/我的累计/待审批数 |
| 15 | `POST /user/fund/dissolve?familyId=` | dissolve | reason? | 解散基金（余额须为 0） |

### 关键返回结构

**info**
```json
{ "hasFund": true, "fund": { "id":1, "name":"朱氏互助基金", "totalAmount": 1200.5, "singleDepositLimit":1000, "...": "..." },
  "myRole": "leader", "roleLabel": "族长", "permissions": ["deposit","withdraw","transfer","view_all","approve","manage_member","manage_rule","dissolve"], "isLeader": true, "myBalance": 200 }
```

**transactions**
```json
{ "list": [{ "id":1, "type":"deposit", "typeLabel":"存入", "amount":100, "direction":1, "status":1, "statusLabel":"成功",
             "operatorName":"朱明", "targetName":"", "paymentLabel":"微信", "remark":"聚餐基金", "balanceAfter":1200.5, "createTime":"2026-08-20 10:00:00" }],
  "total": 10, "page": 1, "pageSize": 10, "income": 500, "expense": 120 }
```

**stats**
```json
{ "totalAmount": 1200.5, "todayIncome": 100, "todayExpense": 0, "monthIncome": 500, "monthExpense": 120,
  "myBalance": 200, "myDeposit": 300, "myWithdraw": 100, "myTxCount": 5, "pendingCount": 1 }
```

---

## 四、核心测试用例（冒烟清单）

| # | 场景 | 步骤 | 预期 |
| --- | --- | --- | --- |
| T01 | 创建基金 | 家族 A 成员 POST create | 返回 id；info.hasFund=true；创建人为族长；initAmount 计入总额与个人余额 |
| T02 | 重复创建 | 同家族再 create | 400「已创建基金」 |
| T03 | 存入限额 | amount > single_deposit_limit | 400 提示超单次限额 |
| T04 | 每日限额 | 两次存入累计超 daily_deposit_limit | 第二次 400，提示可再存金额 |
| T05 | 直接取出 | amount ≤ 阈值 | 公共池/个人余额同步扣减，status=1 |
| T06 | 大额取出 | amount > 阈值且 need_approval=1 | 返回 status=2，余额不变，pendingCount+1 |
| T07 | 审批通过 | 族长 approve=true | 公共池/个人余额扣减，流水 status=1 |
| T08 | 审批驳回 | 族长 approve=false | 流水 status=3，余额不变 |
| T09 | 转账 | A→B amount 100 | A.balance-100、B.balance+100，公共池不变，计入 A 取出限额 |
| T10 | 转账对象 | target 不在成员名单 | 400「对方尚未加入基金」 |
| T11 | 余额不足 | withdraw/transfer amount > myBalance | 400「个人可用余额不足」 |
| T12 | 权限校验 | member 调 withdraw（无权限） | 403「您没有该操作权限」 |
| T13 | 成员权限编辑 | 族长给 member 开 withdraw | 该成员后可取出 |
| T14 | 移除成员 | 目标余额 > 0 时 removeMember | 400 提示先清零 |
| T15 | 解散 | 余额 > 0 时 dissolve | 400「余额不为 0」；清零后解散成功，基金状态=2 |
| T16 | 对账 | 按日期/类型筛选 + income/expense | 汇总与流水逐条核对一致 |

> 说明：上述用例为接口级冒烟清单。依赖本地 MySQL 环境执行迁移脚本后，可配合 Postman/curl 逐条验证；核心资金操作均在事务内以 `SELECT ... FOR UPDATE` 锁基金行，保证并发下余额一致。

---

## 五、与现有系统集成

- 家族归属/角色判定复用 `family_permission` 表与 `family.creator_user_id`（与宗亲聚会模块一致）。
- 认证复用全局 `UserJwtAuthGuard` + `@Public()` 模式，管理端权限体系不受影响。
- 小程序入口：首页金刚区「家族基金」→ `/pages/fund/index`（原「家族成员」入口由底部「族成员」tab 承接）。
- 页面清单：`pages/fund/{index,create,op,records,members,settings}` 六页，已在 `app.json` 注册。
