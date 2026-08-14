# 小程序按键文字垂直居中问题排查与修复记录

## 1. 问题现象

部分页面中按键（`<button>` 组件）内的文字出现上下不居中的情况，文字视觉上偏上，且在不同机型 / 屏幕尺寸下偏移程度不一致。

## 2. 影响范围

| 页面 | 组件类名 | 问题描述 |
|---|---|---|
| `pages/add-member/add-member.wxml` | `.submit-btn`（添加/保存成员） | 文字明显偏上 |
| `pages/create-family/create-family.wxml` | `.submit-btn`（创建家族） | 文字明显偏上 |
| `pages/publish-dynamic/publish-dynamic.wxml` | `.submit-btn`（发布） | 依赖默认隐式行高，跨设备存在偏移隐患 |

## 3. 根因分析

### 3.1 原生 `button` 组件的默认行高

微信小程序原生 `button` 组件基础样式自带：

```css
button {
  line-height: 2.55555556; /* ≈ 46px / 18px，由默认字号 18px 与默认高度 46px 推算 */
  ...
}
```

该 `line-height` 是一个**相对倍数**。当自定义样式设置固定 `height` 但不同步设置 `line-height`（或 flex 居中）时：

- 文本行盒高度 = `line-height × font-size`（如 `2.55555556 × 32rpx ≈ 81.8rpx`）
- 容器高度 = `height`（如 `96rpx`）
- 行盒高度 < 容器高度，行盒默认从内容区顶部对齐，**文字下方留白**，视觉上文字偏上约 7rpx

这正是 `add-member` / `create-family` 两个提交按钮的问题所在（`height: 96rpx` 且无任何居中处理）。

### 3.2 跨平台字体渲染差异

- 默认 `line-height: 2.55555556` 是基于 **18px** 字号推算的固定倍数，一旦按钮 `font-size` 被自定义（如 32rpx），该倍数不再等于按钮默认高度。
- iOS（SF Pro / 苹方）与 Android（思源黑体 / 系统默认）对中文、数字字形的 ascent/descent 处理不同，纯靠 `line-height = height` 时，不同设备仍可能产生 1~3rpx 的视觉偏移。
- `publish-dynamic` 的 `.submit-btn` 未设置 `height`，完全依赖默认隐式行高，属于隐藏隐患。

## 4. 修复方案

对存在问题的按钮统一采用 **flex 居中 + `line-height: 1`** 方案：

```css
.submit-btn {
  width: 100%;
  height: 96rpx;
  /* 背景、圆角、字号等原有样式不变 */
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1; /* 覆盖 button 默认 line-height: 2.55555556 */
}
```

方案对比：

| 方案 | 说明 | 结论 |
|---|---|---|
| `line-height` 等于 `height` | 如 `line-height: 96rpx`，简单但依赖字体基线，跨设备仍有微偏 | 可用但非最优 |
| flex 居中 + `line-height: 1` | 与项目中 view 模拟按钮（`.action-btn` 等）方案一致，不受字体基线差异影响，未来支持 icon+text | ✅ 采用 |

已修改文件：

- `pages/add-member/add-member.wxss` → `.submit-btn`
- `pages/create-family/create-family.wxss` → `.submit-btn`
- `pages/publish-dynamic/publish-dynamic.wxss` → `.submit-btn`（补充显式 `height: 96rpx`，与原设计高度一致）
- `pages/index/index.wxss` → `.start-btn`（由 `line-height = height` 统一为 flex 方案）
- `pages/profile/profile.wxss` → `.logout-btn`（同上）
- `pages/backup/backup.wxss` → `.backup-btn`、`.restore-btn`（同上）

## 5. 全量排查结论

对全部 22 个页面中所有可点击按钮组件逐一检查后，项目中全部 7 处原生 `<button>` 组件均已统一为 flex 居中方案：

| 页面 | 类名 | 修改前 | 状态 |
|---|---|---|---|
| `index` | `.start-btn` | `height: 96rpx; line-height: 96rpx` | ✅ 已统一为 flex 方案 |
| `add-member` | `.submit-btn` | 仅 `height`，无居中 | ✗ 已修复 |
| `create-family` | `.submit-btn` | 仅 `height`，无居中 | ✗ 已修复 |
| `publish-dynamic` | `.submit-btn` | 依赖默认行高 | ✗ 已修复 |
| `profile` | `.logout-btn` | `height: 88rpx; line-height: 88rpx` | ✅ 已统一为 flex 方案 |
| `backup` | `.backup-btn` / `.restore-btn` | `height: 88rpx; line-height: 88rpx` | ✅ 已统一为 flex 方案 |

**view 模拟按钮（已用 flex 居中，全部正常，未改动）：**
`.action-btn`（member-detail / event-detail / doc-detail / photo-detail / family-tree-detail）、`.modal-btn`、`.tool-btn`、`.enter-btn`、`.create-family-btn`、`.filter-btn`、`.more-btn`、`.worship-btn`、`.upload-btn`、`.fab-add`（album / family-docs / timeline / member-list）、`.add-image` 等。

## 6. 跨平台渲染特性与注意事项

- 本项目为**原生微信小程序**（WXML/WXSS），`button` 的 `line-height: 2.55555556` 为微信基础库默认样式；支付宝小程序（ACSS）及 Taro/uni-app 等跨端框架的按钮默认样式各不相同。
- **跨端注意事项**：若迁移至 Taro/uni-app，按钮默认样式差异更大（uni-app 中 `<button>` 各端默认 line-height/padding 不同），应统一采用 flex 居中方案，并显式声明 `line-height`、`height`，避免依赖任一端的默认值。
- **后续新增按钮规范**：凡设置固定 `height` 的按钮，必须满足以下任一条件，否则视为缺陷：
  1. `display: flex; align-items: center; justify-content: center; line-height: 1;`（推荐）；或
  2. `line-height` 与 `height` 保持一致且不依赖系统字体基线。
- `button::after { border: none; }` 用于移除默认边框，不影响垂直居中。

## 7. 验证方案（需在微信开发者工具中执行）

本机无法直接运行微信开发者工具，以下为回归验证步骤：

1. **模拟器机型测试**：微信开发者工具 → 编译，分别选择 iOS 与 Android 机型模拟（如 iPhone 15 Pro / iPad / 小米 14 / 华为 Mate 60），进入以下页面检查文字是否垂直居中：
   - `add-member`（添加成员 / 保存修改按钮）
   - `create-family`（创建家族按钮）
   - `publish-dynamic`（发布按钮，注意 disabled 状态）
   - `index`（开始探索家谱）、`profile`（退出登录）、`backup`（立即备份 / 恢复数据）
2. **不同分辨率**：在模拟器设置中切换不同屏幕尺寸（含刘海屏机型，验证安全区 `env(safe-area-inset-bottom)` 无影响）。
3. **真机测试**：使用 iOS 与 Android 真机各一台，开启/关闭"跟随系统字体大小"后复测上述按钮。
4. **回归**：确认修改后无横向/纵向布局错乱，按钮高度视觉不变（`publish-dynamic` 按钮高度由默认 92rpx 统一为 96rpx，视觉差异约 2px，可接受）。

## 8. 修改文件清单

- `mini-program/pages/add-member/add-member.wxss`
- `mini-program/pages/create-family/create-family.wxss`
- `mini-program/pages/publish-dynamic/publish-dynamic.wxss`
- `mini-program/pages/index/index.wxss`
- `mini-program/pages/profile/profile.wxss`
- `mini-program/pages/backup/backup.wxss`
- `mini-program/docs/button-vertical-centering-fix.md`（本文档）
