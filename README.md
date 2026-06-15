# 咨询师助手

面向 iOS、Android 和 Web 的咨询师工作台 MVP。前端使用 Expo React Native，后端使用 FastAPI、PostgreSQL 和私有 MinIO。

## 责任边界

- 移动端只负责页面交互、短期表单状态、设备录音、文件选择、系统日历和下载分享。
- FastAPI 负责认证、权限、业务校验、状态流转、报告生成、生命周期和级联删除。
- PostgreSQL 保存用户、档案、咨询记录、附件关系、录音元数据、转写、纪要、报告、隐私授权、日程和督导会话。
- MinIO 保存上传原文件、原始录音和后端生成的 PDF/DOCX 字节；前端只接收短期签名 URL。
- 原始录音默认 14 天销毁且不能长期保存；转写、纪要、报告和附件需用户主动授权后才能长期保存。

## 本地服务

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
- 演示账号：`demo@example.com`
- 演示密码：`Demo1234!`

### 录音转写与纪要

- `RECORDING_AI_PROVIDER=bailian` 启用百炼真实模型。
- 本地私有 MinIO 使用 `RECORDING_AUDIO_INPUT_MODE=base64`：后端读取 MinIO 音频字节，调用 `qwen3-asr-flash`，适合不超过 10MB、5 分钟的联调录音。
- 生产 MinIO 可被阿里云公网访问后，切换为 `RECORDING_AUDIO_INPUT_MODE=minio_url`：后端生成短期预签名 URL，由 `fun-asr` 异步识别长录音。
- 转写完成后由 `qwen-plus` 根据文字生成主纪要和章节，不把 MinIO 账号、密码或对象存储 key 发送给模型。
- `backend/.env` 已被 Git 忽略；仓库中的 `.env.example` 只保存变量名和占位符。

## 启动移动端

```bash
cd apps/mobile
npm install
npm start
```

Web 和 iOS 模拟器默认连接 `http://127.0.0.1:8000/api/v1`；Android 模拟器默认连接 `http://10.0.2.2:8000/api/v1`。真机调试时设置局域网地址：

```bash
EXPO_PUBLIC_API_BASE_URL=http://<电脑局域网IP>:8000/api/v1 npm start
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
cd android
JAVA_HOME=$(/usr/libexec/java_home -v 17) \
ANDROID_HOME="$HOME/Library/Android/sdk" \
./gradlew assembleDebug
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
