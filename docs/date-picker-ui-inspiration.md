# iOS 时间/日期选择器 UI 参考

> 来源：Mobbin（830+ 真实 App 截图）、Uiland、Dribbble、Refero 等设计灵感站。
> 目的：为我们 App（档案详情页的「设置下次咨询时间」）找更干净、现代的样式方向。

## 一、好看的 iOS UI 灵感网站

| 站点 | 地址 | 特点 |
|---|---|---|
| **Mobbin** | https://mobbin.com/explore/mobile/ui-elements/date-picker | 真实上架 App 的截图库，可按 UI 组件筛选；date-picker 有 830+ 案例，最实用 |
| **Uiland** | https://uiland.design/components/date-picker | 15 万+ 真实 App 屏幕截图，按组件归类，支持设计模式搜索 |
| **Dribbble** | https://dribbble.com/search/date-picker-ios | 设计师作品集，偏概念稿/视觉稿，适合找配色与动效灵感 |
| **Refero** | https://refero.design/ | 数万张 UI/UX 参考图，高级搜索，覆盖 Web + iOS |
| **Apple HIG** | https://developer.apple.com/design/human-interface-guidelines | 官方规范，date picker / picker 的权威交互定义（系统原生样式基准） |

## 二、时间选择器的 6 种主流样式（来自 Mobbin 真实 App）

| # | 样式 | 代表 App | 视觉特征 | 适用场景 |
|---|---|---|---|---|
| 1 | **日历网格 + 底部弹窗**（Bottom Sheet Calendar） | Airbnb、Uber Eats、Expedia、Google Calendar、Alipay | 月视图方格，半透明遮罩上滑；选中用品牌色填充，未选中灰字；留白充足 | 需要选「哪一天」，选项多、范围大 |
| 2 | **滚轮 / 卷轴**（Wheel / Spinner） | Cash App、Target、Panera Bread | 经典 iOS Picker，底部弹窗内；中间高亮分割线，无边框卡片，文字化「Done」按钮 | 精准输入（生日、时长），省空间 |
| 3 | **平铺块 / 时间槽**（Tile / Segment） | DoorDash、Swiggy、Klarna | 小圆角矩形，未选浅灰、选中品牌色白字；常带「热门」徽标 | 有限时间段（如 9:00/9:30 取餐） |
| 4 | **滑块 + 日历组合** | Airbnb、Lyft | 细线滑块快速换月，旁侧日历点选 | 搜索过滤、范围选择 |
| 5 | **对话框 / 全屏覆盖** | TimeTree、Strava、Asana | 居中对话框带阴影浮层、大圆角；或全屏页含顶部标题+关闭 | 需要聚焦、不希望背景被操作 |
| 6 | **列表内嵌** | Microsoft Teams、Craft、Neo Financial | 设置行右侧显示已选日期，点击转 Bottom Sheet | 轻量调度，融入信息架构 |

## 三、「干净现代」的共同特征

1. **圆角与卡片化**：几乎都用 8–16pt 圆角，无硬边。
2. **克制用色**：浅底 + 单一品牌色强调，灰阶过渡自然。
3. **底部弹窗优先**：Bottom Sheet 触手可及又不挡全屏。
4. **即时反馈**：点选即刻高亮，配合 Save / 自动回填。
5. **自适应布局**：日历网格自适应宽度，Tile 可横滑。

## 四、对我们 App 的改进建议（对照现状）

**现状问题**（档案详情页展开「设置下次咨询时间」）：
- iOS 用的是原生 `spinner` 滚轮（日期列 + 时间列），文字偏大、日期被截断。
- 内联展开在卡片里，没有遮罩/弹窗层级，和页面层级混在一起。

**推荐方向（按投入从小到大）**：

| 方案 | 做法 | 工作量 |
|---|---|---|
| A. 收入 Bottom Sheet | 把现有 spinner 包进从底部滑出的半透明遮罩卡片，加「完成」文字按钮 | 小 |
| B. 日历网格 + 时间滚轮 | 自定义月历网格（圆角、品牌色高亮选中日）+ 下方时间滚轮，像 Airbnb/Uber | 中 |
| C. 平铺时间槽 | 「下次咨询」通常是固定几个时段（如 9:00 / 14:00 / 19:00），改成可选 Tile | 中（需确认业务是否固定时段） |

> 若想最贴近 iOS 原生又干净：**方案 A**（Bottom Sheet 包裹当前 spinner）最稳，投入最小、风险最低。
> 若想要「最好看」：**方案 B**（日历网格 + 时间滚轮）视觉最现代，但需手写日历组件。
