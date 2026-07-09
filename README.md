# 咨询师助手

面向 iOS、Android 和 Web 的咨询师工作台 MVP。前端使用 Expo React Native，后端使用 FastAPI、PostgreSQL 和私有 MinIO。

## 责任边界

- 移动端只负责页面交互、短期表单状态、设备录音、文件选择、系统日历和下载分享。
- FastAPI 负责认证、权限、业务校验、状态流转、报告生成、生命周期和级联删除。
- PostgreSQL 保存用户、档案、咨询记录、附件关系、录音元数据、转写、纪要、报告、隐私授权、日程和督导会话。
- MinIO 保存上传原文件、原始录音和后端生成的 PDF/DOCX 字节；前端只接收短期签名 URL。
- 原始录音默认 14 天销毁且不能长期保存；转写、纪要、报告和附件需用户主动授权后才能长期保存。

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

## MVP 范围

- 录音转写和录音纪要已接入百炼；自动化测试使用可注入的确定性 provider，避免测试消耗模型额度。
- AI Job 已持久化并提供状态、事件和取消接口；当前录音处理在请求内完成，后续长录音可迁移到独立 Worker。
- 档案访问密码按来访者、督导师、受督者三类独立设置；短期授权只保存在当前页面会话，敏感子资源接口会在后端再次校验。
