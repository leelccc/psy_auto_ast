# 咨询师助手

面向 iOS、Android 和 Web 的咨询师工作台 MVP。前端使用 Expo React Native，后端使用 FastAPI、PostgreSQL 和私有 MinIO。

## 责任边界

- 移动端只负责页面交互、短期表单状态、设备录音、文件选择、系统日历和下载分享。
- FastAPI 负责认证、权限、业务校验、状态流转、报告生成、生命周期和级联删除。
- PostgreSQL 保存用户、档案、咨询记录、附件关系、录音元数据、转写、纪要、报告、隐私授权、日程和督导会话。
- MinIO 保存上传原文件、原始录音和后端生成的 PDF/DOCX 字节；前端只接收短期签名 URL。
- 原始录音默认 14 天销毁且不能长期保存；转写、纪要、报告和附件需用户主动授权后才能长期保存。

## 更新日志（Change Log）

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
