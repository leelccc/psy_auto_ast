# 咨询师助手

面向 iOS、Android 和 Web 的咨询师工作台 MVP。前端使用 Expo React Native，后端使用 FastAPI、PostgreSQL 和私有 MinIO。

## 责任边界

- 移动端只负责页面交互、短期表单状态、设备录音、文件选择、系统日历和下载分享。
- FastAPI 负责认证、权限、业务校验、状态流转、报告生成、生命周期和级联删除。
- PostgreSQL 保存用户、档案、咨询记录、附件关系、录音元数据、转写、纪要、报告、隐私授权、日程和督导会话。
- MinIO 保存上传原文件、原始录音和后端生成的 PDF/DOCX 字节；前端只接收短期签名 URL。
- 原始录音默认 14 天销毁且不能长期保存；转写、纪要、报告和附件需用户主动授权后才能长期保存。

## 更新日志（Change Log）

### 2026-09-01 · 档案基本信息编辑入口轻量化（0901-6）

- **档案详情**：移除档案头部卡片底部整行的「编辑基本信息」通用按钮，将入口收进姓名右侧，避免它与档案状态、频率和下次安排争抢视觉层级。
- **视觉设计**：新增暖米色微型胶囊，左侧为陶土色圆形铅笔徽记，配轻微暖灰阴影；按下时背景加深并下沉 1px，保持当前温暖、克制的移动端风格，不使用 HTML 按钮样式。
- **移动端可用性**：视觉高度为 30px，通过 `hitSlop` 将实际触控范围扩展到 48px；补充 button role 与「编辑档案基本信息」无障碍标签。长姓名单行收缩，保留编辑入口和「已解锁」徽章空间。
- **验证**：`npm run typecheck` 通过；前端全量 98 项测试通过；`git diff --check` 通过。移动 Web 真实页面联调受生产 API 的 localhost CORS 策略限制，未为截图放宽线上跨域配置。**BUILD_TAG** 升至 `0901-6`；功能提交时尚未部署 Web，也未构建或上传 APK。
- **Web 部署**：用户随后明确要求部署 Web；已用 `EXPO_PUBLIC_API_BASE_URL=https://maxpeking.top/api/v1` 重新导出并覆盖服务器 `/opt/psy_auto_ast/web`，Nginx 配置检查与 reload 成功。线上 bundle `AppEntry-4f43b2adfdc4588a64376ecc7ef5524c.js` 已核对包含 `0901-6` 和 HTTPS API 地址，公开首页及健康接口均返回 200。部署前备份：`/opt/psy_auto_ast/backups/web_20260901_201926/web_before_0901_6.tar.gz`。本次仍未构建或上传 APK。

### 2026-09-01 · HTTPS 全量收口清单（0901-5）

- **新增权威清单 `docs/https-migration-checklist.md`**：APK + iOS + Web + 服务端全链路从 `http://47.96.89.215` 迁到 `https://maxpeking.top` / `https://oss.maxpeking.top` 的逐条勾选清单（含文件路径 + 行号 + 可复制的 nginx 配置 + 回归验收项 + 回滚方案）。**后续改 HTTPS 以该文档为准，避免改漏。**
- **修正此前误判**：iOS 上**上传也挂**，不是只有下载挂。此前认为 `recording_audio_input_mode=base64` 让上传不受影响——实际那是「后端交给 AI 的音频输入方式」，而**文件本身仍走 `createUpload` → `PUT presigned URL`**，同样被 ATS 拒。
- **根因收敛**：后端产生绝对 URL 的地方只有 `backend/app/services/storage.py:44`（`create_upload_url`）和 `:55`（`create_download_url`），仅受 `minio_endpoint` + `minio_secure` 控制。**改这两个环境变量即全链路变 https，无需改业务代码**；DB 只存 `storage_key` 不存 URL，迁移与回滚零数据风险。
- **出口 3 个**：`POST /api/v1/files`→`upload_url`（files.py:87）、`GET /api/v1/files/{id}/download-url`→`download_url`（files.py:120）、`recordings.py:229`→`audio_url`（服务端内部给百炼下载用，仅 `minio_url` 模式触发）。
- **前端消费点 11 处**（回归必测）：`App.tsx` 1187/1540（上传 PUT）、2200/2266（导出）、3041/3068/3090/3121（录音播放）、5051/5167（附件预览/下载）；底层 `src/native/fileTransfer.ts:54`(PUT)、`:79/:102/:114`(GET)。
- **nginx 反代 MinIO 四要点**（缺一即失败，已写入清单文档）：`proxy_set_header Host $host`（SigV4 预签名把 Host 算进签名，用默认 `$proxy_host` 会 403）、`client_max_body_size 500m`、`proxy_request_buffering off`、`proxy_buffering off`。
- **安全待办已记录**：MinIO 9000 端口当前公网可达（`http://47.96.89.215:9000/minio/health/live` 返回 200），迁移后应从安全组撤掉；9001 console 已确认不可达。

### 2026-09-01 · iOS 端 ATS 临时白名单（0901-4 续）

- **背景**：0901-4 跑通 iOS 模拟器并修好安全区，但发现 iOS 硬阻塞未解——服务器 `MINIO_ENDPOINT=47.96.89.215:9000`（HTTP 裸 IP 非标端口）→ 后端 `presigned_get_object`/`presigned_put_object` 返回的预签名 URL 是 `http://...` → iOS ATS 直接拒。**录音播放**（`fileService.getDownloadUrl`）和**附件/导出下载**在 iOS 上全挂。**录音上传**走 `recording_audio_input_mode=base64` 默认值（JSON body），不受影响。
- **临时方案**（仅 Ad Hoc 内部分发可用，App Store 审核会拦，要走「彻底收口」时移除）：`apps/mobile/ios/app/Info.plist` 加 `NSExceptionDomains`（`47.96.89.215` 允许 HTTP）；同步在 `apps/mobile/app.json` 的 `ios.infoPlist.NSAppTransportSecurity` 落持久记录（**注意**：`app.json` 改完需 `npx expo prebuild --platform ios` 让 Expo 重新生成 Info.plist 才生效；这次手动改 Info.plist 是 dev session 临时方案，gitignored）。
- **彻底收口（生产方案 A）待办**（动生产，用户点头才做）：
  1. 阿里云 DNS 给 `oss.maxpeking.top` 加 A 记录（47.96.89.215）
  2. `certbot certonly --standalone -d oss.maxpeking.top` 签子域证书
  3. nginx 443 反代到本地 `minio:9000`
  4. 后端 `.env` 改 `MINIO_ENDPOINT=oss.maxpeking.top`、`MINIO_SECURE=true`
  5. `docker compose -f compose.prod.yaml up -d --build backend` 重建镜像（~25 分钟）
  6. 移除 `Info.plist` / `app.json` 的 ATS 临时白名单
- **已知状态**：构建产物 `app.app/Info.plist` 经 `PlistBuddy` 验证含 `NSExceptionDomains.47.96.89.215.NSExceptionAllowsInsecureHTTPLoads=true`；App 启动正常（模拟器登录页可达；具体播放链路需登录后实测）。**未在本批验证**：因为 osascript System Events 权限 `-10004` 拒，没法在模拟器里发键盘事件登录后点开录音，播放链路的端到端验证留给你手动测（模拟器菜单 Bar → Hardware → Keyboard → Connect Hardware Keyboard；或点击输入框弹软键盘）。

### 2026-09-01 · iOS 端首版构建链跑通 + 安全区修复（0901-4）

- **背景**：用户决定做 iOS 端。本机 Xcode 26.5 + iOS 26.5 模拟器、已 prebuild 的 `apps/mobile/ios`（含 Pods）、CocoaPods 1.16.2；目标「能分发给其他人安装」，账号「免费 Apple ID」+「暂时只有模拟器」（免费 Apple ID 无法导出可分发的 IPA，需 ¥688/年的付费个人账号才能 Ad Hoc 分发到 100 台设备）。
- **构建链验证**（Xcode 26.5 + RN 0.81.5 + Expo SDK 54 兼容，0 error / 0 warning）：`EXPO_PUBLIC_API_BASE_URL=https://maxpeking.top/api/v1 npx expo run:ios -d "iPhone 17"`（注：SDK 54 已移除 `--simulator`，统一用 `-d`）。**踩坑**：`expo run:ios` 末尾用 osascript 激活模拟器窗口时被 AppleEvents 权限拒绝（`isSimulatorAppRunningAsync: -10004`）—— 绕过：手动 `nohup npx expo start -p 8081` 起 Metro，`xcrun simctl install` + `xcrun simctl launch booted com.psyautoast.counselor` 拉起 App，build 产物在 `apps/mobile/ios/build/Build/Products/Debug-iphonesimulator/app.app`。
- **图标 alpha 修复**：`assets/icon.png` 带 alpha 通道（iOS 上传会触发 `ITMS-90717`），用项目 venv 的 Pillow 合成到 App 底色 `#FAF6F0` 重写（实际像素无透明，视觉零差异）。
- **iOS 安全区**（`App.tsx`）：原 `SafeAreaView` 来自 `react-native`（已弃用，Metro 警告）且 `styles.safe.paddingTop: Platform.OS === "android" ? NativeStatusBar.currentHeight ?? 0 : 0` 只护 Android → iOS 状态栏/灵动岛/Home 指示条会遮挡内容。改：
  - 装 `react-native-safe-area-context`（`npx expo install` 自动挑 SDK 54 兼容版）+ `pod install` 接入原生模块
  - `App.tsx` 改 import：`SafeAreaView`/`SafeAreaProvider` from `react-native-safe-area-context`，移除 RN 自带的 `StatusBar as NativeStatusBar` 引入
  - `App` 的三个分支（loading / guest / authenticated）统一外层包 `<SafeAreaProvider>`
  - 4 处 `<SafeAreaView style={styles.safe}>` 加 `edges={["top", "bottom"]}`，让 safe-area-context 接管 iOS 灵动岛 + Home 指示条 inset
  - `styles.safe` 移除 `paddingTop` hack，由 `edges` 统一处理（Android 行为不变：top = 状态栏高度，bottom = 0；iOS 行为：top = 灵动岛区，bottom = Home 指示条区）
- **InfoPlist 出口合规**：`app.json` 的 `ios.infoPlist` 加 `ITSAppUsesNonExemptEncryption: false`，避免每次 Archive 询问出口合规。
- **已知 iOS 硬阻塞**（待用户决策后处理）：服务器 `MINIO_ENDPOINT=47.96.89.215:9000`（HTTP 裸 IP 非标端口）→ 后端 `presigned_get_object`/`presigned_put_object` 返回 `http://47.96.89.215:9000/...` 预签名 URL → iOS ATS 直接拒。**录音播放**（`fileService.getDownloadUrl`）和**附件/导出下载**会全部失败。**录音上传**走 `recording_audio_input_mode=base64` 默认值（JSON body），不受影响。修法两条路：A. 彻底收口（nginx 反代 MinIO 到 `https://oss.maxpeking.top` + certbot 签子域证书 + 改 `MINIO_ENDPOINT`/`MINIO_SECURE`，顺带解决 09-01 列的「HTTPS 收口」待办）；B. Info.plist `NSExceptionDomains` 临时允许 `47.96.89.215` 走 HTTP（Ad Hoc 内部分发可用，App Store 审核会拦）。
- **分发路径**（用户付费个人 Apple 开发者账号就绪后才能走）：
  - 付费个人账号（¥688/年，Apple ID 直接升级，最快 24-48h 生效，无须 D-U-N-S）+ Ad Hoc（100 台/年，需收集 UDID）→ nginx 挂 `/ipa/` location 走 `itms-services://` 链接（照 /apk/ 的 no-cache 做法）
  - TestFlight / App Store 上架 → 大陆区需 ICP 备案（要营业执照，暂不可行）
  - 过渡方案：Web PWA（Safari 添加到主屏幕），零成本
- **验证**：`tsc --noEmit` 通过；前端全量 98 项测试通过；HTTPS API 地址的 Web export 通过；iPhone 17 模拟器原生构建、安装和启动成功（0 error / 0 warning）；截图确认登录页未被灵动岛或 Home 指示条裁切；`icon.png` 已确认 `hasAlpha: no`；`git diff --check` 通过。模拟器日志此前也确认 `https://maxpeking.top/api/v1/calendar/settings` 200 OK（QUIC/HTTP3 走 443，30s 持续连接后被取消——日历轮询正常）。**键盘避让（KeyboardAvoidingView）未做**（TextInput 多但目前 RN 的 ScrollView 自动滚焦点输入可见，主屏登录/注册/编辑表单需在真机实测再决定要不要做）。**BUILD_TAG** 升至 `0901-4`。
- **背景 Metro 弃用警告**：可能仍会在 Metro 终端出现 SafeAreaView deprecation 警告——`App.tsx:174` 已加 `LogBox.ignoreLogs(["SafeAreaView has been deprecated"])`，运行时不再 toast；终端警告来源是 Metro 检测到 `react-native` 自带 SafeAreaView 仍被打包（理论上代码已不用，警告应消失；若仍出现，是 metro preset 的检测滞后，不影响运行）。

### 2026-09-01 · 邮箱验证码前端打包收口（0901-3）

- **背景**：0901-1 完成邮箱验证码注册/重置密码的前后端代码并 commit（HEAD `148998c`）；0901-2 完成生产后端部署（SMTP 已写入 `47.96.89.215` 的 `backend/.env`，`POST /auth/verification-code` 真发邮件验证通过，alembic 建 `email_verification_codes` 表）。但**线上前端（web/APK）仍是旧 AuthScreen**——本次补齐前端打包收口。
- **Web 重新导出**：`EXPO_PUBLIC_API_BASE_URL=https://maxpeking.top/api/v1 npx expo export --platform web`，产物 `dist/` 经 tar+rsync 覆盖 `/opt/psy_auto_ast/web`（服务器用 `find web -mindepth 1 -delete` 清空保留目录再解压）；线上暴露「获取验证码 / 忘记密码」新 UI。
- **APK 重新打包（按约定默认不上传，本轮回填说明）**：`gradlew assembleRelease`（JDK 17，`EXPO_PUBLIC_API_BASE_URL=http://47.96.89.215/api/v1` 保持 IP 直连兼容）本地重新打包为 `app-release.apk`（BUILD_TAG 0901-3）。按 0830 发版约定**默认只更新 web、不上传 APK**；但本次 rsync 在中断前已先行传完，故服务器 `/opt/psy_auto_ast/apk/app-release.apk` 实际已是 0901-3，下载页 `BUILD_TAG` 已同步为 `0901-3`。**下次发版默认不再主动传 APK**（用户自取本机产物）。
- **BUILD_TAG** 升至 `0901-3`（「我的」页底部显示，用于 Android 核对安装版本）。APK 的 https 域名切换与 MinIO https 仍属待收口（待 DNS 稳定后重打）。

### 2026-09-01 · 邮箱验证码注册 + 重置密码（构建 0901-1）

- **暂缓微信登录**：因暂无营业执照，前端登录页移除「微信登录」入口，改为「邮箱 + 密码」为主登录方式。后端 `wechat_auth` 路由与 `external_accounts` 表保留（未配置时接口返回 503），待后续申请到开放平台资质后再启用。
- **邮箱验证码注册**：新增 `POST /api/v1/auth/verification-code`（发送验证码，用途 register/reset_password，含 60s 冷却、10min 有效期、最多 5 次校验、只存哈希）+ `POST /api/v1/auth/register` 增加 `code` 字段，注册需先通过邮箱验证码校验。
- **验证码重置密码**：新增 `POST /api/v1/auth/reset-password`（`email + code + new_password`），重置成功后直接签发令牌并登录；前端登录页新增「忘记密码？」入口与「重置密码」模式。
- **前端交互**：`AuthScreen` 增加验证码输入 + 「获取验证码」按钮（60s 倒计时）与开发环境 `dev_code` 提示；注册/重置模式复用同一验证码行。
- **SMTP 配置**（`backend/.env`，未配置时开发环境回传 `dev_code`、生产环境报 503）：`SMTP_HOST`、`SMTP_PORT`（默认 465）、`SMTP_USERNAME`、`SMTP_PASSWORD`、`SMTP_FROM`（留空用 username）、`SMTP_USE_SSL`（true=SSL/465，false=STARTTLS/587）；验证码参数 `VERIFICATION_CODE_LENGTH`/`VERIFICATION_CODE_MINUTES`/`VERIFICATION_CODE_RETRY_SECONDS`/`VERIFICATION_CODE_MAX_ATTEMPTS`。
- **数据库**：新增 `email_verification_codes` 表（alembic 迁移 `a1b2c3d4e5f6`）。`BUILD_TAG` 升至 `0901-1`。
- **验证**：`apps/mobile` `tsc --noEmit` 通过；后端 `create_app()` 导入与路由注册通过（新增 3 条 auth 路由）。

### 2026-09-01 · HTTPS 域名落地与 Web Mixed Content 修复

- **域名与证书**：`maxpeking.top`（阿里云注册）NS 切到阿里云 DNS 后，服务器用 Let's Encrypt `certbot certonly --standalone` 签发证书，已配 `systemd timer` + pre/post hook 自动续期。`https://maxpeking.top/` 可正常访问，证书到期 2026-11-29。
- **nginx 策略**：`http://maxpeking.top` 自动 301 跳转 `https`；`http://47.96.89.215`（IP 直连）继续走 http，兼容旧 APK；`/apk/` 下载页同样走 https。
- **Web Mixed Content 修复（问题 0901-1）**：浏览器通过 `https://maxpeking.top/` 访问时，前端仍请求 `http://47.96.89.215/api/v1/auth/login`，被浏览器拦截。已重新执行 `EXPO_PUBLIC_API_BASE_URL=https://maxpeking.top/api/v1 npx expo export --platform web` 并覆盖服务器 `/opt/psy_auto_ast/web`，线上 bundle 已改为 https 域名。
- **待收口**：APK 的 `EXPO_PUBLIC_API_BASE_URL` 改为 `https://maxpeking.top/api/v1` 重打 release；MinIO `MINIO_ENDPOINT` 改 `https://maxpeking.top`；新包普及后关闭 IP 直连 http。

### 2026-09-01 · 本地 Android APK 打包（0831-5）

- **本地 APK 已构建**：按用户明确要求执行 Android release 打包，产物为 `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`，大小 `70,723,550 bytes`（约 67MB），MD5 `1359477fafac1f1d4d0b12d1205c5845`。
- **包内校验**：APK 内 JS bundle 已确认包含 `BUILD_TAG=0831-5` 与生产样 API 地址 `http://47.96.89.215/api/v1`；AndroidManifest 包名为 `com.psyautoast.counselor`，`versionName=0.1.0`，并保留 `usesCleartextTraffic=true` 以支持当前 HTTP 服务器。
- **分发状态**：本次只完成本地打包，未上传或覆盖服务器 `/apk/` 下载页；如需手机从服务器下载新版 APK，需要单独执行 APK 上传/分发步骤。

### 2026-08-31 · 问题0831-5 生成资料口径 + 档案基本信息编辑

- **单次记录草稿资料源修复**：`生成咨询记录/受督记录/督导记录` 现在只依据当前历程的摘要、转写、录音纪要和本次附件；后端 `/reports/generation-sources` 与 `/reports/generate` 在非 `case_report` 时不再混入全档案报告、其他历程记录或个案报告。个案报告仍保留全档案资料选择口径。
- **基本信息次数语义修正**：档案里的咨询/受督/督导次数改为“约定次数/基本信息次数”，可编辑，但不再参与真实历程序号。新增历程和归档录音的记录编号只按实际 session 顺延。
- **三类档案编辑弹窗**：档案详情的「编辑基本信息」改为 RN `<Modal>` 弹窗，不再在当前页面内展开；三类档案都可改姓名/编号/状态/性别/频率/约定次数/备注，来访者额外可改首访时主诉和危机评估，督导师/受督者可改督导形式。
- **新增档案入口调整**：新增档案页顶部从三张纵向身份卡片改为 tab/分段切换，避免“新增来访者/督导师/受督者”一条条占满页面。
- **metadata 更新保护**：后端 `PATCH /profiles/{id}` 对 `metadata` 改为局部合并，避免只改频率时把性别、首访主诉或督导形式清掉。
- **源码标识**：`BUILD_TAG` 升至 `0831-5`，便于后续打包后核对安装版本；本轮部署时未默认打 APK，2026-09-01 已按用户明确要求另行完成本地 APK 打包。
- **部署**：已部署到服务器 `47.96.89.215`：Web dist 覆盖 `/opt/psy_auto_ast/web`，后端补丁覆盖 `/opt/psy_auto_ast/backend` 并执行 `docker compose -f compose.prod.yaml up -d --build backend`。部署前备份位于 `/opt/psy_auto_ast/backups/deploy_0831_5_20260831_235832/`。
- **验证**：`cd apps/mobile && npm run typecheck` 通过；`cd apps/mobile && node --import tsx --test src/__tests__/*.test.ts`：`98 passed`；`cd backend && ../venv/bin/python -m compileall app` 通过；`git diff --check` 通过。线上 `http://47.96.89.215/` 返回 200，`/api/v1/health` 返回 `api/database/object_storage` 全 ok，公网 bundle 含 `0831-5` 与 `47.96.89.215/api/v1`。本地后端 pytest 需要 Docker PostgreSQL，当前 Docker daemon 未运行，未执行。

### 2026-08-31 · 总根因闭环：Android 请求 query string 丢失（构建 0831-4）

- **实锤证据**（nginx 访问日志 + 生产库直查 + API 重放）：Android（okhttp）发出的 `GET /api/v1/reports` **完全没有 query string**，返回该用户全部报告的第一条（8-30 的正式版）→ 生成页判定「已有报告」→ 直接跳编辑页。Web（Chrome）的同一请求带 `?session_id=...&report_type=...` → 空列表 → 正常进生成页。**四天来 Android/Web 一切行为差异的总根因**。
- **机制**：`reportService.list` 用 `params.size ? `?${params}` : ""` 判断是否拼 query。`URLSearchParams.prototype.size` 是 2023 年新增 getter；**Hermes 引擎自带的原生 URLSearchParams 没有它**，RN 的 `polyfillGlobal` 因全局已存在而跳过 JS 补丁 → Android 上 `params.size` 恒为 undefined → **整个 query 被丢弃**。浏览器原生支持 `.size` → web 一切正常。
- **修复（3 处，`params.size` → `params.toString()`，所有实现通用的基础方法）**：
  - `reportService.list`：报告按 session/type 过滤（本 bug，生成分支错乱）
  - `recordingService.list`：录音按归档/AI 状态/关键词过滤（**问题0830-2 #1「选未归档音频」在 Android 上实际一直列的是全部录音**，本次一并修复）
  - `calendarService.listEvents`：日程按时间范围过滤
- **叠加修复（同版 0831-4）**：
  - `ActionNotice` toast 由 `position:absolute` 自绘覆盖层改为官方 `<Modal>`（Android 红线：absolute 覆盖层不置顶）。**过去所有 toast/错误提示在 Android 上均不可见**——0830-5 诊断探针「没看到」的真相即此。改为 Modal + 点击遮罩关闭 + 4.5 秒自动消失。
  - 生成页检测到已有报告而直接进编辑页时，toast 明确说明「已找到该次草稿/正式版」及去向，不再静默跳转。
  - 从编辑器/生成页返回档案详情时轻量刷新各次历程的记录状态（`refreshSessionStatuses`，只拉 sessions+reports 两个接口），按钮文案不再使用旧快照。
  - 合并 0831-1/2/3 未部署修复：生成页接口失败改为页面级错误+重试、档案加载时以真实报告列表校准历程状态。
- `BUILD_TAG` 升至 `0831-4`，本次实际打包 APK 并更新 web。

### 2026-08-31 · Android 咨询记录按钮状态修复（构建 0831-3）

- **纠正旧结论**：Android 端「生成咨询记录」仍可能表现为没有跳转，0830-6 的“触摸问题已解决”不能作为最终结论。
- **真实回退路径**：点击后虽然同步设置了生成页状态，但只要报告列表或生成资料接口快速失败，旧代码就立即清空页面状态并自动返回档案详情，只留一条短暂 toast；Android 可能来不及绘制中间加载页，因此看起来和按钮没响应完全一致。
- **修复**：接口失败后不再自动返回。生成页持续显示页面级错误、具体原因、「重新读取资料」和「返回本次历程」，用户始终能看到点击结果并可重试。
- **交互清理**：移除会话卡片内部 2.5 秒的伪“正在打开”状态，按钮只负责触发导航，加载状态统一由生成页呈现。
- **最终问题定义**：已有报告时自动进入编辑页是正确行为；Android 的错误是卡片状态仍显示「生成咨询记录」，让正确跳转看起来像跳错页面。
- **状态校准**：档案加载时除会话接口外，再读取真实报告列表并校准每次历程的状态。存在草稿时显示「查看/编辑咨询记录」，存在正式版时显示「查看咨询记录」；不再只依赖可能陈旧的 `record_status`。
- **恢复正确导航**：检测到已有报告时继续自动打开编辑页；此前 `0831-2` 对这条逻辑的修改已撤回。
- `BUILD_TAG` 最终升至 `0831-3`，用于 Android 安装后核对状态同步修复。

### 2026-08-30 · 问题0830-1 收口（构建 0830-6，触摸修复确认）

- **用户实测 0830-5**：点「生成」虽没看到探针 toast，但页面确实跳转了——证明**点击已送达**，前几轮「点了没反应」的根因就是 Android 端触摸没进按钮（不是渲染层级）。跳转直接进「咨询记录编辑页」是因为所点历程已存在记录，按设计跳过确认页直接开编辑页（重新生成草稿在编辑页内），属预期行为。
- **根因定位**：主 `ScrollView` 在输入框聚焦时会把按钮点击吞掉用于收键盘（`keyboardShouldPersistTaps` 默认 `never`、Android 特有），叠加 `Pressable` 在该路径不如 `TouchableOpacity` 稳。0830-5 同时改了这两点即生效。
- **0830-6 收口**：移除 0830-5 的诊断 toast 探针，保留真实修复（`TouchableOpacity` + `keyboardShouldPersistTaps="handled"` + `openSessionRecord` try/catch），`BUILD_TAG` 升 0830-6。
- **验收口径**：在「尚无记录」的历程点「生成咨询记录」应进入生成页（显示「正在读取可用资料」→ 资料清单/确认生成）；在已有记录的历程点则直接进编辑页（预期）。

### 2026-08-30 · 问题0830-1 继续定位（构建 0830-5，诊断探针）

- **现状**：前面几轮把确认框从 absolute 覆盖层 → `<Modal>` → 全屏页面，Android 端点击「生成咨询记录」仍无任何反应，而 web 端正常。由于无法在本机复现 Android，改为「先加确定性的探针、再据现象定点修复」。
- **本次改动（均为前端 `App.tsx`）**：
  - 点击按钮**先弹 toast「已触发生成」（含构建号 0830-5）**，用于区分两类根因：① 看到 toast 但页面不跳 → 是跳转/渲染或 `openSessionRecord` 内抛错（已加 try/catch 把错误用 toast 显式报出）；② 连 toast 都看不到 → 触摸事件根本没送到按钮（走响应链/覆盖层方向查）。
  - `openSessionRecord` 整体包 try/catch，`setQuickView("reportGeneration")` + `setPendingReportGeneration` 仍保持同步最先执行，任何异常都会被显式提示，不再静默失败。
  - 生成按钮由 `Pressable` 改回 `TouchableOpacity`（与同卡片内「录音/量表/作业」一致，触摸响应最稳），并给主 `ScrollView` 加 `keyboardShouldPersistTaps="handled"`（规避输入框聚焦时按钮点击被吞）。
  - `BUILD_TAG` 升至 `0830-5`，便于安装后一眼核对。
- **让用户怎么看**：装完 0830-5 后点「生成」——若底部弹出「已触发生成」但没进页面，把「打开生成页失败」那条 toast 内容发我；若完全没反应，说明是触摸没送达，我再查卡片层级/覆盖层。

### 2026-08-30 · APK 分发缓存修复 + 构建版本标识

- **APK 装完仍是旧版**：根因在服务器 `nginx.conf` 的 `/apk/` 配置了 `Cache-Control: public, max-age=3600`。每次发版都覆盖同名 `app-release.apk`，但浏览器/下载器在缓存期内会继续返回旧包，于是反复出现「代码明明改了、手机上还是原样」。已改为 `no-store, no-cache, must-revalidate` + `expires -1`；web 的 `_expo/` 静态资源带内容 hash，仍保留 `public, immutable`（两者要区分开）。下载页链接另加 `?v=<构建标识>` 作为双保险。
- **构建版本标识**：`App.tsx` 新增 `BUILD_TAG` 常量，显示在「我的」页底部，用于一眼确认手机上安装的是哪一次构建；下载页同步展示。再遇到「手机上还是旧版」，先核对这个标识。
- 下载页补充引导：手机已装旧版时建议先卸载再安装，避免覆盖安装不生效。
- 验证：APK 响应头 `Cache-Control: no-store…`、`Content-Length` 与新包一致；下载页显示「构建 0830-3」；web bundle hash 与本地导出一致。

### 2026-08-30 · 问题0830-1 复现修复：「生成咨询记录」改走全屏页面

- **现象**：上一轮已把确认框从覆盖层改为 RN 官方 `<Modal>`，Android 端点击「生成咨询记录」依旧没有任何反应。
- **排查**：Modal 的写法本身是标准的（渲染在 ScrollView 之外、`visible` 受控），说明问题不在浮层渲染层级，而是**根本没走到设置弹框状态的那一步**。旧逻辑要先 `await` 两个网络请求才决定是否弹层；且「暂无可用资料」时只弹一个 toast，在 Android 上极易被当成「点了没反应」。
- **修复**：放弃浮层方案，改为**全屏页面**（新增 `reportGeneration` 视图，`ReportGenerationScreen`）：
  - 点击后**立即**跳转页面，网络请求在页面内完成，页面显示「正在读取可用资料」，彻底消除点击后的空白期；
  - 有可用资料：列出将依据的资料清单与「确认生成」；无可用资料：给出明确引导（先归档录音或上传资料），不再只靠一闪而过的 toast；
  - 若该次历程已有记录，页面内自动改为打开编辑页；
  - 「重新生成草稿」复用同一页面（`regenerate` 模式），取消后返回编辑页。
- 部署：web 重新 `expo export` 覆盖；APK 重新 `assembleRelease` 覆盖。本次未改后端，无需重建镜像。

### 2026-08-30 · 问题0830-2 归档提速、录音入口改造与隐私模块重构

前端（`apps/mobile/App.tsx` 等）：

- **录音入口改交互 (#1)**：咨询历程里点「录音」不再直接打开系统文件选择器，改为优先列出**未归档录音**供选择，选中即归档到当前档案与本次历程（`archive` 已支持 `session_id`，后端无需改动）；下方保留「上传本地音频」与「开始新录音」兜底入口。
- **归档提速 (#2)**：`onArchive` 不再 `await runRecordingProcessing`（过去要等整条 AI 流水线跑完才跳转，点击「归档到 XXX」卡顿数十秒），改为后台异步触发、点击即跳转。
- **归档完成页状态轮询 (#2)**：完成页的「完整转写 / 录音纪要」原本是硬编码的「处理中 / 等待中」且永不刷新。改为每 3 秒轮询录音真实状态，动态显示等待中 / 处理中 / 完成 / 失败，全部完成后标题转为「后台处理已完成」，失败时展示后端错误信息。
- **编辑页去冗余 (#3)**：删除咨询记录编辑页顶部卡片里语义不明的「返回」按钮（导航栏本身已有返回）；同步清理不再使用的 `onBack` 传参。
- **正式版隐藏重新生成 (#4)**：编辑页在正式版视图下不再显示「重新生成草稿」按钮（重新生成只作用于草稿）。
- **个案报告默认资料 (#5)**：生成个案报告时默认只勾选「档案基本信息 + 每一次咨询记录」，量表/作业/附件默认不选，仍可手动加选。
- **档案基本信息可编辑 (#6)**：档案详情新增「编辑基本信息」入口，支持修改姓名、档案编号、咨询频率、档案状态、约定/基本信息咨询次数、备注（`PATCH /profiles/{id}` 本就支持这些字段）。
- **档案内隐私管理 (#7)**：档案详情新增「管理本档案的隐私与授权」入口，进入档案隐私页——按录音/转写/纪要/量表/作业/其他/咨询记录/个案报告分类切换，每个分类下分「未授权 · 到期后销毁」与「已授权长期保存」两栏，可就地授权与撤回。
- **我的页隐私改为提醒 (#7)**：「数据与隐私」不再罗列无上下文的资料名，改为**按档案聚合**的到期提醒（XX 档案 N 项资料即将到期 + 最近到期日），点击直达该档案隐私页（仍走访问密码解锁流程，不绕过权限）。

后端（`backend/app/...`）：

- **新增 `GET /api/v1/recordings/{id}/status`**：供归档完成页轮询的轻量状态（只返回 `ai_status`、转写/纪要是否就绪等状态字段，不返回转写正文，避免几秒一次轮询拉取整表）。
- **新增 `GET /api/v1/privacy/profile-resources`**：按档案返回敏感资料与授权状态。`sensitive_resources` 没有 `profile_id`，需按 owner 三段解析归属（profile 直连 / session → profile / recording → session → profile），并按分类过滤；`report` 依据 `report_type` 区分为咨询记录或个案报告。
- **新增 `GET /api/v1/privacy/expiring-by-profile`**：按档案聚合即将到期的敏感资料数量与最近到期时间，供「我的」页提醒使用。
- **附件的隐私口径**：量表/作业/其他属于会话附件，当前不进入 14 天自动销毁与长期保存授权体系（避免引入误删风险），在档案隐私页中一并按分类列出并标注「随档案保留」，不提供授权操作。

部署：web 重新 `expo export` 覆盖 `/opt/psy_auto_ast/web`；后端同步后 `docker compose up -d --build backend` 重建镜像；APK 重新 `assembleRelease` 覆盖 `/opt/psy_auto_ast/apk/`。

### 2026-08-30 · 问题0830-1 安卓首次生成咨询记录不弹确认框

前端（`apps/mobile/App.tsx`）：

- **确认框置顶修复**：首次生成咨询记录的确认框（`ReportGenerationConfirm`）原先用 `absoluteFillObject + zIndex` 覆盖层渲染——浏览器端正常，但 Android 端因层级/安全区裁剪未置顶显示，表现为「点了生成咨询记录没弹框」。改为 RN 官方 `<Modal transparent animationType="fade">` 包裹（含 `onRequestClose` 处理返回键取消），Android/iOS/web 均可靠置顶弹出。整条调用链（`SessionCard → openSessionRecord → reportService.list → setPendingReportGeneration`）平台无关，APK 已含修复代码，根因是渲染层级而非逻辑。

部署：web 重新 `expo export` 覆盖 `/opt/psy_auto_ast/web`；APK 重新 `assembleRelease` 覆盖 `/opt/psy_auto_ast/apk/`，用户重装后验证。

### 2026-08-29 · 问题0829 体验优化 + 部署规范固化

前端（`apps/mobile/App.tsx` 等）：

- **录音确认 (#1)**：新增实时音量条（expo-audio `metering`），保存成功提示「已写入云端归档队列」，确认确实在收音。
- **重新生成常驻 (#2)**：录音纪要卡片「重新生成」改为常驻按钮，不再仅在内容为空时显示。
- **章节速览 (#3)**：分章 prompt 约束按话题、单章 ≥60s、3–8 章；后端 `merge_short_chapters()` 兜底合并碎片章节。
- **新增历程文案 (#5)**：档案详情 SectionHeader 的「新增记录」改为「新增历程」。
- **卡片去冗余 (#6)**：咨询历程卡片移除「记录」按钮（三类档案统一）；底部主按钮按是否生成过咨询记录切换文案——未生成=`生成{类型}`、正式版=`查看{类型}`、草稿=`查看/编辑{类型}`。
- **草稿/正式版真切换 (#8)**：编辑页分段控件真正加载对应版本内容（`onFormalChange` 加载对应报告对象）。
- **默认内容精简 (#9)**：编辑页默认基本信息填系统真实数据、其余版块留空。
- **PDF 系统预览 (#11)**：上传 PDF 支持「用其他应用打开」（`Linking.openURL`）。
- **文件名截断 (#12)**：资料卡片/预览页文件名中间截断展示，预览页额外显示完整原名。
- **图片空白修复 (#13)**：`filePreviewFrame` 补 `height:300`，修复大图预览空白过大。

后端（`backend/app/...`）：

- **record_status 派生 (#7 根因)**：`serialize_session` 不再读静态字段，改由真实报告派生 `record_status`；未生成过不再显示「查看/编辑咨询记录」，首次生成弹确认框。
- **草稿重生成修复 (#10)**：选中资料含失效项时跳过而非 422；`generate/regenerate` 改走 `create_report_ai_provider()` 工厂（不再硬编码 Deterministic）；新增 `build_skeleton_report_blocks()` 生成默认骨架。
- **generation-sources 对齐**：接口新增 `exclude_report_id` 参数，对齐前后端。

部署约定（以后说「部署」= 三件事）：

1. 服务器前端：`expo export --platform web` 产物覆盖 `/opt/psy_auto_ast/web`（卷挂载，`nginx -s reload`）。
2. 服务器后端：`backend/` 同步后 `docker compose -f compose.prod.yaml up -d --build backend` 重建镜像。
3. 安卓 APK：`assembleRelease` 打包并覆盖独立 `/apk/` 下载页（详见下方「生产部署 → 安卓 APK 下载页」）。

### 2026-08-27 · 安卓 APK 本地构建 + 独立下载页 + 文档

- 新增「本地 Gradle 构建安卓 Release APK」章节（JDK 17，`~67MB`，`debug.keystore` 签名可直接安装）。
- 新增「安卓 APK 下载页（独立 `/apk/` 目录）」：compose 挂载 `./apk` + nginx `location /apk/`，与 `./web` 分离避免重发前端被冲掉。
- `docs/production-deployment.md` 补充分发与回滚清单。

## 本地服务

一键启动/停止当前项目（依赖服务、后端、前端）：

```bash
bash scripts/dev.sh start
bash scripts/dev.sh stop
```

常用辅助命令：

```bash
bash scripts/dev.sh status
bash scripts/dev.sh logs
bash scripts/dev.sh restart
```

脚本会把后端和前端日志写入 `.dev/logs/`。如需只启动部分服务，可使用 `SKIP_DEPS=1`、`SKIP_BACKEND=1` 或 `SKIP_FRONTEND=1`；停止时如需保留 PostgreSQL/MinIO，可使用 `KEEP_DEPS=1 bash scripts/dev.sh stop`。

```bash
cp .env.example .env
docker compose up -d
```

| 服务 | 地址 | 账号 | 密码 |
|---|---|---|---|
| PostgreSQL | `127.0.0.1:55432` | `psy_auto_ast` | `psy_auto_ast_dev` |
| MinIO API | `http://127.0.0.1:59000` | `psy_auto_ast` | `psy_auto_ast_minio_dev` |
| MinIO Console | `http://127.0.0.1:59001` | `psy_auto_ast` | `psy_auto_ast_minio_dev` |

MinIO bucket 为 `psy-auto-ast`，默认禁止匿名访问。

## 启动后端

```bash
python3 -m venv venv
venv/bin/pip install -r backend/requirements.txt
cp .env.example backend/.env
# 在 backend/.env 中填写 BAILIAN_API_KEY
cd backend
../venv/bin/alembic upgrade head
PYTHONPATH=. ../venv/bin/python -m app.seed
../venv/bin/uvicorn app.main:app --reload --port 8000
```

- API：`http://127.0.0.1:8000/api/v1`
- OpenAPI：`http://127.0.0.1:8000/docs`
- 演示账号：`admin@163.com`
- 演示密码：`123456`

- 普通用户账号登录：
- 邮箱：user@163.com
- 密码：123456

### 录音转写与纪要

- `RECORDING_AI_PROVIDER=bailian` 启用百炼真实模型。
- 本地私有 MinIO 使用 `RECORDING_AUDIO_INPUT_MODE=base64`：后端读取 MinIO 音频字节，调用 `qwen3-asr-flash`，适合不超过 10MB、5 分钟的联调录音。
- 生产 MinIO 可被阿里云公网访问后，切换为 `RECORDING_AUDIO_INPUT_MODE=minio_url`：后端生成短期预签名 URL，由 `fun-asr` 异步识别长录音。
- 转写完成后由 `qwen-plus` 根据文字生成主纪要和章节，不把 MinIO 账号、密码或对象存储 key 发送给模型。
- `backend/.env` 已被 Git 忽略；仓库中的 `.env.example` 只保存变量名和占位符。

## 启动移动端

有三种方式，按场景选择：

### 方式一：Expo Dev Server（日常开发，热更新）

```bash
cd apps/mobile
npm install
npx expo start --port 19000
```

启动后：
- 按 `i` 键在 iOS 模拟器打开
- 按 `a` 键在 Android 模拟器打开
- 按 `w` 键在浏览器打开（Web 端）
- 或用 iPhone 相机扫终端里的 QR 码，在 Expo Go 里打开

Web 和 iOS 模拟器默认连接 `http://127.0.0.1:8000/api/v1`；Android 模拟器默认连接 `http://10.0.2.2:8000/api/v1`。

真机调试时设置局域网地址：

```bash
EXPO_PUBLIC_API_BASE_URL=http://<电脑局域网IP>:8000/api/v1 npx expo start --port 19000
```

### 方式二：expo run:ios（原生构建，测试原生模块）

当需要测试原生模块（如 `expo-audio` 音频播放）时，需要编译原生 shell 并安装到模拟器：

```bash
cd apps/mobile
npx expo run:ios --device "iPhone 17 Pro"
```

| 命令 | 速度 | 用途 |
|---|---|---|
| `npx expo start` | 快，支持热更新 | 日常界面开发 |
| `npx expo run:ios` | 慢（需编译），但是真实原生 App | 测试原生模块（音频、麦克风等） |
| `npm run android` | 慢（需编译），但是真实原生 App | Android 模拟器/真机测试 |

> ⚠️ `expo-audio` 是原生模块，音频播放问题必须在模拟器或真机上用 `expo run:ios` 测试，Web 端的 `<audio>` 和原生端的 `expo-audio` 是两套独立系统。

### 方式三：Android 模拟器本机调试

首次配置 Android SDK 命令路径：

```bash
cat >> ~/.zshrc <<'EOF'

# Android SDK
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
EOF

source ~/.zshrc
```

本机已创建的 Android AVD 名称为 `psy_api35`。启动全套 Android 调试：

```bash
# 1. 启动 PostgreSQL / MinIO
docker compose up -d

# 2. 启动后端
cd backend
../venv/bin/alembic upgrade head
../venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

另开一个终端：

```bash
# 3. 启动 Android 模拟器
source ~/.zshrc
emulator -avd psy_api35 -no-snapshot-load
```

另开一个终端：

```bash
# 4. 编译安装并打开 Android App
source ~/.zshrc
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
cd apps/mobile
npm run android
```

Android 模拟器访问宿主机后端使用 `http://10.0.2.2:8000/api/v1`，项目已在 `apps/mobile/src/api/apiConfig.ts` 中默认配置。

## 停止移动端

根据启动方式不同，停止方法不同：

### 方式一：停止 Expo Dev Server（`npx expo start`）

在启动它的终端按 **Ctrl+C** 即可停止 Metro Bundler。

如果终端已关闭，用命令停止：

```bash
# 查找并停止 Expo/Metro 进程
ps aux | grep "expo start" | grep -v grep
kill <PID>

# 或者一键停止（杀掉所有 node 子进程中的 expo/metro）
pkill -f "expo start"
pkill -f "metro"
```

### 方式二：停止 expo run:ios 编译的 App

1. **停止 Metro Bundler**（如果还在运行）：在启动终端按 **Ctrl+C**
2. **关闭模拟器中的 App**：在 iOS 模拟器中按 **Shift+Cmd+H** 回到主页，上滑关闭 App
3. **关闭模拟器**：在 Simulator 菜单选择 **Quit Simulator**，或按 **Cmd+Q**

```bash
# 一键停止所有 Expo 相关进程
pkill -f "expo run:ios"
pkill -f "metro"
```

### 方式三：停止 Android 调试

```bash
# 停止 Android App
adb shell am force-stop com.psyautoast.counselor

# 停止 Metro / Expo
pkill -f "expo run:android"
pkill -f "metro"

# 关闭 Android 模拟器
adb emu kill

# 如果 adb emu kill 不生效，再杀模拟器进程
pkill -f "emulator.*psy_api35"
```

### 停止所有移动端服务（推荐）

```bash
# 停止所有 Expo/Metro 进程
pkill -f "expo"
pkill -f "metro"

# 关闭 Android 模拟器
adb emu kill

# 确认已停止
ps aux | grep -E "expo|metro" | grep -v grep
adb devices
```

## 停止服务

```bash
# 停止后端（按 Ctrl+C 停掉 uvicorn）
# 停止前端（按 Ctrl+C 停掉 expo）
# 停止 Docker 服务
docker compose down

# 如果也要删除数据库数据（重建时从头开始）
docker compose down -v
```

## 测试

```bash
cd backend
../venv/bin/pytest -q

cd ../apps/mobile
npm run typecheck
npm test
npx expo-doctor --verbose
npx expo export --platform web --output-dir dist
```

后端测试自动使用独立的 `psy_auto_ast_test` 数据库，不会清空开发数据库。

## 原生构建

生成原生工程：

```bash
cd apps/mobile
npx expo prebuild --clean
```

Android 调试 APK：

```bash
cd apps/mobile/android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
ANDROID_HOME="$HOME/Library/Android/sdk" \
./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a
```

APK 输出到 `android/app/build/outputs/apk/debug/app-debug.apk`。

iOS 模拟器：

```bash
cd ios
pod install
cd ..
xcodebuild \
  -workspace ios/app.xcworkspace \
  -scheme app \
  -sdk iphonesimulator \
  -configuration Debug \
  CODE_SIGNING_ALLOWED=NO \
  build
```

云端预览/生产构建使用 `apps/mobile/eas.json`：

```bash
npx eas build --profile preview --platform android
npx eas build --profile production --platform all
```

App Store 和 Google Play 的正式签名仍需要项目所有者自己的 Apple Developer / Google Play 账号与证书。

## 生产部署

生产服务器：`47.96.89.215`（Ubuntu 24.04，Docker + compose v2），工作目录 `/opt/psy_auto_ast/`。完整上线前清单见 `docs/production-deployment.md`。下面是可直接照抄的「改完代码 → 上服务器」速查。

### 服务器拓扑（现状）

| 服务 | 来源 | 暴露端口 | 备注 |
|---|---|---|---|
| postgres | 镜像 `postgres:16-alpine` | 内部 5432 | 卷 `postgres_data` |
| minio | 镜像 `minio/minio:latest` | `9000`（公网） | 卷 `minio_data`，`MINIO_ENDPOINT=47.96.89.215:9000` |
| backend | **由服务器 `/opt/psy_auto_ast/backend` 构建镜像** | `8000` | 改代码必须重建镜像 |
| web | `nginx:alpine` + 卷 `./web` | `80` | 静态站，直接覆盖目录 |

两个关键事实决定了更新方式：

- **backend 是镜像构建**：`compose.prod.yaml` 里 `build.context: ./backend`。所以后端代码改动要先同步到服务器 `/opt/psy_auto_ast/backend`，再 `docker compose up -d --build backend` 重建并重启；只改文件不重建不会生效。
- **web 是卷挂载**：`./web → /usr/share/nginx/html:ro`。把 `expo export --platform web` 产物覆盖到 `/opt/psy_auto_ast/web` 即可，`nginx -s reload` 生效。
- **nginx 已代理 API**：`nginx.conf` 中 `location /api/ { proxy_pass http://backend:8000; }`。因此 Web 端用同源地址 `http://47.96.89.215/api/v1`，浏览器不发跨域请求，**无需配 CORS**（CORS 只影响外部独立 Web 域名）。

### 后端打包 + 部署

本机（改完 `backend/` 后）：

```bash
cd <repo>
# 1) 只打包改动的后端文件，保持 backend/ 相对路径
tar -czf /tmp/backend_patch.tar.gz \
  backend/app/core/config.py \
  backend/app/services/ai/factory.py \
  backend/app/services/ai/bailian.py \
  backend/app/services/ai/deterministic.py \
  backend/app/services/exports.py \
  backend/app/api/routes/reports.py \
  backend/app/api/routes/attachments.py

# 2) 传到服务器 /tmp
scp /tmp/backend_patch.tar.gz root@47.96.89.215:/tmp/
```

服务器（SSH 登录 root 后）：

```bash
cd /opt/psy_auto_ast
tar -xzf /tmp/backend_patch.tar.gz          # 解压到 ./backend/...（保留原相对路径）
rm -f /tmp/backend_patch.tar.gz
docker compose -f compose.prod.yaml up -d --build backend   # 重建镜像 + 重启容器
curl -s http://127.0.0.1:8000/api/v1/health  # 期望 {"status":"ok",...}
```

> 若新增了 Python 依赖，先改 `backend/requirements.txt` 一并打包；镜像构建会重装依赖（requirements 层命中缓存很快）。
> 报告生成开关：`backend/.env` 中 `REPORT_AI_PROVIDER=bailian` 走真实百炼模型；`deterministic`（默认）走结构化草稿、免额度。当前生产已设为 `bailian`。

### 浏览器（Web）打包 + 部署

本机：

```bash
cd apps/mobile
# 同源地址：走 nginx /api 代理，避免跨域
EXPO_PUBLIC_API_BASE_URL=http://47.96.89.215/api/v1 \
  npx expo export --platform web --output-dir dist

cd dist
tar -czf /tmp/web_dist.tar.gz .
scp /tmp/web_dist.tar.gz root@47.96.89.215:/tmp/
```

服务器：

```bash
cd /opt/psy_auto_ast
find web -mindepth 1 -delete             # 清空目录但保留 web 本身，避免 nginx 的 bind mount 失效（别用 rm -rf web && mkdir）
tar -xzf /tmp/web_dist.tar.gz -C web
find web -name '._*' -delete            # 清掉 macOS 资源 fork 残留
docker exec psy-auto-ast-web-1 nginx -s reload
# 若访问 / 出现 403，说明 bind mount 指向了旧目录，重启容器重新绑定：
# docker restart psy-auto-ast-web-1
```

### 移动端（原生 App）打包

#### 方式 A：本地 Gradle 构建安卓 Release APK（推荐，可全程本地完成）

`android/` 已 prebuild，`AndroidManifest.xml` 含 `android:usesCleartextTraffic="true"`（连 `http://` 服务器不受限）。本机 Android SDK 已就绪，EAS CLI 未安装/未登录，**本地 Gradle 比 EAS 省事**。

> ⚠️ JDK 必须用 **17**：RN 0.81 + Gradle 8.14 + AGP 9 不兼容默认的新版 JDK（java 25 会构建失败）。本机已装 Corretto 17，用它即可。

```bash
cd apps/mobile
export JAVA_HOME=/Users/apple/Library/Java/JavaVirtualMachines/corretto-17.0.15/Contents/Home
export ANDROID_HOME=/Users/apple/Library/Android/sdk
export EXPO_PUBLIC_API_BASE_URL=http://47.96.89.215/api/v1     # 编译进包，装好即连公网
export GRADLE_OPTS="-Xmx4096m -XX:MaxMetaspaceSize=1024m"
cd android
./gradlew assembleRelease
# 产物：android/app/build/outputs/apk/release/app-release.apk（~67MB，debug.keystore 签名，可直接安装）
```

要点：
- release 默认用 `debug.keystore` 签名（`signingConfigs.debug`），`assembleRelease` 直接出可安装包，无需自建发布密钥。
- `EXPO_PUBLIC_API_BASE_URL` 在构建时写死进 JS bundle；**必须**指向 `http://47.96.89.215/api/v1`，否则装好会回退连 localhost。
- 校验包内地址：`unzip -p app-release.apk assets/index.android.bundle | grep -c 47.96.89.215`（应 ≥1）。
- 上架 Google Play 才需要自有发布密钥 + `eas submit` / 手动重签名，那步需你的开发者账号。

#### 方式 B：EAS 云构建（需自有账号）

```bash
cd apps/mobile
npx eas login                                              # 首次需 EAS 账号
EXPO_PUBLIC_API_BASE_URL=http://47.96.89.215/api/v1 \
  npx eas build --profile preview --platform android      # 安卓内测 APK
# 双端生产构建（production = autoIncrement 版本号）
EXPO_PUBLIC_API_BASE_URL=http://47.96.89.215/api/v1 \
  npx eas build --profile production --platform all
npx eas submit --profile production                        # 上架 App Store / Google Play
```

> 安卓 debug 包也可：`cd apps/mobile/android && ./gradlew assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk`（仅自测）。

### 安卓 APK 下载页（独立 `/apk/` 目录）

把 APK 放在 Web 根目录的裸链接有个隐患：重发 Web 前端会清空整个 `./web` 目录，APK 和页面会被一起冲掉。因此下载页与 APK 放在**与 `./web` 分离的 `/apk/` 目录**。

服务器结构（`compose.prod.yaml` 已含该挂载，`nginx.conf` 已含路由）：

```yaml
# compose.prod.yaml · web 服务新增挂载
volumes:
  - ./web:/usr/share/nginx/html:ro
  - ./apk:/opt/psy_auto_ast/apk:ro     # 下载页 + APK，独立于 web
```

```nginx
# nginx.conf
location /apk/ {
  alias /opt/psy_auto_ast/apk/;
  try_files $uri $uri/ =404;
}
```

- 下载页：`http://47.96.89.215/apk/`（陶土色品牌落地页，含「下载安卓 APK」按钮 + 安装说明）。
- APK 直链：`http://47.96.89.215/apk/app-release.apk`（支持断点续传，完整 67MB）。

**更新 APK 版本（只动 apk 目录，不碰 web）**：

```bash
# 1) 本机重新打包（见上方「方式 A」），得到新的 app-release.apk
# 2) 覆盖到服务器的 /apk/：
scp android/app/build/outputs/apk/release/app-release.apk root@47.96.89.215:/opt/psy_auto_ast/apk/
# 无需重启容器，落地页（index.html）不变。重发 Web 前端也不会影响下载页。
```

> 首次搭建该目录时需在服务器建 `/opt/psy_auto_ast/apk/`，放入 `app-release.apk` + `index.html` 落地页，再 `docker compose -f compose.prod.yaml up -d web` 让新挂载与 nginx 路由生效。

### 回滚

```bash
cd /opt/psy_auto_ast
# 代码回滚：先 scp 旧文件覆盖 ./backend，再重建
docker compose -f compose.prod.yaml up -d --build backend
# 或仅重启当前镜像
docker compose -f compose.prod.yaml restart backend
```

## MVP 范围

- 录音转写和录音纪要已接入百炼；自动化测试使用可注入的确定性 provider，避免测试消耗模型额度。
- AI Job 已持久化并提供状态、事件和取消接口；当前录音处理在请求内完成，后续长录音可迁移到独立 Worker。
- 档案访问密码按来访者、督导师、受督者三类独立设置；短期授权只保存在当前页面会话，敏感子资源接口会在后端再次校验。
