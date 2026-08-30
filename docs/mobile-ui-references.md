# 移动端 UI 参考站点（设计改造时查阅）

> **用途**：后续任何界面 / 组件需要改版时，先来这里取参考，再动手改造。
> **当前品牌基调**：陶土色（clayDark `#9F5747`）+ 暖白底（paper `#FFF9F3` / surface `#FFFDF9`）+ 克制用色（完整令牌见 `apps/mobile/src/theme.ts`）。
> **关联文档**：时间选择器专项参考见 `docs/date-picker-ui-inspiration.md`；Apple 风预览见 `designs/apple-redesign.html`。

## 一、综合灵感站（真实 App 截图，首选）

| 站点 | 地址 | 最适合 |
|---|---|---|
| **Mobbin** | https://mobbin.com/explore/mobile | 真实上架 App 按组件 / 屏幕筛选；列表、表单、设置页、弹层都有大量案例，最实用 |
| **Page Flows** | https://pageflows.com | 真实 App 的用户流程 + 截图，看"任务流怎么排、步骤怎么组织" |
| **Screenlane** | https://screenlane.com | 移动端 UI 模式库：导航、空状态、卡片、底部弹窗等 |
| **Refero** | https://refero.design | 高级 UI/UX 参考图，支持强搜索 |

## 二、规范与风格基准

| 站点 | 地址 | 最适合 |
|---|---|---|
| **Apple HIG** | https://developer.apple.com/design/human-interface-guidelines | iOS 官方交互 / 组件规范基准 |
| **Material Design 3** | https://m3.material.io | 安卓端规范参考 |

## 三、视觉 / 配色灵感（偏概念稿）

| 站点 | 地址 | 最适合 |
|---|---|---|
| **Dribbble** | https://dribbble.com | 配色、动效、视觉稿灵感 |
| **Pinterest** | https://pinterest.com | moodboard 拼贴，快速找整体方向 |

## 四、使用约定

1. 用户指出「某屏 / 某组件不好看」时：先据此清单定位 1–2 个对标的真实 App 案例（必要时用 WebFetch 拉最新截图 / 页面），再结合 `theme.ts` 令牌提改造方案。
2. **维持陶土色系**，不大幅改配色，除非用户明确要求换风格。
3. 优先改样式令牌（`radius` / `shadow` / 字重 / 间距）而非业务逻辑；改动尽量集中、可逆。
4. 改造后应在真机 / 模拟器预览（`cd apps/mobile && npx expo start`）确认观感，再继续下一处。

## 五、已落地的样式基线（改造时的对照）

- 圆角：`sm 12` / `md 16` / `lg 22` / `xl 30`（2026-08-27 抬升）
- 阴影：`soft`（弹层）、`modal`（底部弹窗）、`card`（内容卡片，轻量）
- 字重：正文 / 按钮统一在 `600–700`，不再用 `900` 黑重字
- 卡片：核心卡片（listCard / quickAction / metricCard / datePickerTrigger）已加 `shadow.card` + 大圆角
