# HTTPS 全量收口清单（APK + iOS + Web + 服务端）

> 目标：把全链路从 `http://47.96.89.215`（裸 IP / 非标端口）迁到 `https://maxpeking.top` + `https://oss.maxpeking.top`。
> **本文是穷举清单，逐条勾选执行，避免改漏。**
> 建立时间：2026-09-01。核对基准：commit `a1e1603` 之后。

---

## 0. 为什么必须做

| 端 | 现状 | 后果 |
|---|---|---|
| **Android** | `AndroidManifest.xml` 有 `android:usesCleartextTraffic="true"` | HTTP 能用，**但不是长久之计**（明文传输录音/附件，且上架会被要求收紧） |
| **iOS** | ATS 默认拒所有 HTTP | **上传 + 下载全部失败**（详见 §2）。当前靠 `NSExceptionDomains` 临时白名单绕过，App Store 审核会拦 |
| **Web** | 页面已 HTTPS，但后端 presigned URL 是 HTTP | 浏览器 **Mixed Content** 拦截，播放/下载失败 |

**关键结论（务必记住）**：iOS 上挂掉的不只是「下载」，**上传也挂**。
`App.tsx` 的附件上传和录音文件上传都走 `createUpload` → `PUT <presigned http URL>`，同样被 ATS 拒。

---

## 1. URL 是怎么产生的（根因，只有这 2 个函数）

后端**唯一**产生绝对 URL 的地方：

| 文件 | 行 | 函数 | 产出 |
|---|---|---|---|
| `backend/app/services/storage.py` | 44–53 | `MinioStorage.create_upload_url` → `presigned_put_object` | `http(s)://<MINIO_ENDPOINT>/<bucket>/<key>?X-Amz-...` |
| `backend/app/services/storage.py` | 55–60 | `MinioStorage.create_download_url` → `presigned_get_object` | 同上 |

两者都由 `minio_endpoint` + `minio_secure` 决定 scheme/host/port：

```python
# backend/app/services/storage.py:29-34
self.client = Minio(
    self.settings.minio_endpoint,          # ← 改成 oss.maxpeking.top
    ...
    secure=self.settings.minio_secure,     # ← 改成 True
)
```

**改这两个环境变量，所有 presigned URL 自动变 https，无需改业务代码。**
（DB 里只存 `storage_key`，不存 URL，所以历史数据零迁移。）

---

## 2. URL 是从哪些接口吐给客户端的（3 个出口）

| # | 出口 | 文件:行 | 字段 | 客户端拿到后做什么 | iOS 现状 |
|---|---|---|---|---|---|
| 1 | `POST /api/v1/files` | `backend/app/api/routes/files.py:87` | `upload_url` | **PUT 上传**文件 | ❌ ATS 拒 |
| 2 | `GET /api/v1/files/{id}/download-url` | `backend/app/api/routes/files.py:120` | `download_url` | **GET 下载**/播放/预览/分享 | ❌ ATS 拒 |
| 3 | 录音 AI 处理 | `backend/app/api/routes/recordings.py:229` | `audio_url` | **服务端内部**：交给阿里云百炼下载音频 | ⚠️ 不返回客户端，但需公网可达 |

关于 #3：`audio_url` 只在 `RECORDING_AUDIO_INPUT_MODE=minio_url` 时生成（当前生产是 `base64`，走 `audio_bytes`）。
**如果日后切 `minio_url`，百炼要用公网 URL 拉音频 —— 改成 https 后同样受益。**

---

## 3. 前端消费点（改完服务端后需回归验证的全部位置）

底层实现：
- `apps/mobile/src/native/fileTransfer.ts:54` — `uploadLocalFile` → `PUT uploadUrl`
- `apps/mobile/src/native/fileTransfer.ts:79 / 102 / 114` — `downloadAndShareFile` → `GET downloadUrl`
- `apps/mobile/src/api/fileService.ts:49-50` — `getDownloadUrl()`

`App.tsx` 调用点（**9 处，逐一回归**）：

| 行号 | 场景 | 动作 |
|---|---|---|
| 1187 | 附件上传 | `PUT upload.upload_url` |
| 1540 | 录音文件上传 | `PUT upload.upload_url` |
| 2200–2202 | 导出下载（报告/纪要 1） | `getDownloadUrl` → 下载分享 |
| 2266–2268 | 导出下载（报告/纪要 2） | 同上 |
| 3041–3045 | **录音播放**（主链路） | `setPlaybackUrl` + `player.replace(url)` |
| 3068–3069 | 录音播放（URL 过期刷新） | 同上 |
| 3090–3091 | 录音播放（重试） | 同上 |
| 3121 | 录音播放 `loadSource` | 同上 |
| 5051–5053 | 附件预览 | `setPreviewUrl` |
| 5167–5169 | 附件下载 | 下载分享 |

> 注：`src/downloadFlow.ts`（纪要 PDF 本地生成）**不走网络**，不受影响。

---

## 4. 迁移执行清单（按顺序勾选）

### 4.1 前置（DNS + 证书）

- [ ] **阿里云 DNS** 加 A 记录：`oss.maxpeking.top` → `47.96.89.215`
- [ ] 等传播生效：`dig oss.maxpeking.top +short` 应返回 `47.96.89.215`
- [ ] 服务器签发证书：
      ```bash
      certbot certonly --standalone -d oss.maxpeking.top
      ```
- [ ] **确认自动续期覆盖新域名**：现有 systemd timer 的 pre/post hook 是为 `maxpeking.top` 写的，
      检查 `/etc/letsencrypt/renewal/oss.maxpeking.top.conf` 是否存在，并把新域名加进续期后 reload 的 hook。

### 4.2 nginx：新增 MinIO 反代

在 `/opt/psy_auto_ast/nginx.conf` 增加（**四个关键点缺一不可**）：

```nginx
# HTTP :80 — 子域跳 HTTPS
server {
    listen 80;
    server_name oss.maxpeking.top;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name oss.maxpeking.top;

    ssl_certificate     /etc/letsencrypt/live/oss.maxpeking.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/oss.maxpeking.top/privkey.pem;

    # ① 录音最大 500MB（见 files.py MAX_FILE_SIZE_BYTES["recording"]）
    client_max_body_size 500m;
    # ② 关掉请求缓冲，否则 500MB 会先落 nginx 磁盘再转，直接超时/爆盘
    proxy_request_buffering off;
    proxy_read_timeout 900s;
    proxy_send_timeout 900s;

    location / {
        proxy_pass http://minio:9000;
        proxy_http_version 1.1;
        # ③ 必须传真实 Host：SigV4 预签名把 Host 算进签名，
        #    用默认的 $proxy_host(=minio:9000) 会导致签名校验失败 403
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # ④ 大文件流式上传/下载
        proxy_buffering off;
    }
}
```

- [ ] 写入后先测配置：`docker exec psy-auto-ast-web-1 nginx -t`
- [ ] 再 reload：`docker exec psy-auto-ast-web-1 nginx -s reload`
- [ ] 验证反代通：`curl -I https://oss.maxpeking.top/minio/health/live`（应 200）

> ⚠️ **web 容器要能解析 `minio` 这个服务名**：确认 `compose.prod.yaml` 里 `web` 与 `minio` 在同一个 compose network，
> 且 `web` 有 `depends_on: minio`。若不在同网络，改用 `http://47.96.89.215:9000` 作为 upstream（不推荐，绕公网一圈）。

### 4.3 后端环境变量（`/opt/psy_auto_ast/.env`）

- [ ] `MINIO_ENDPOINT=oss.maxpeking.top`  ← **不要带 `:443`**（带了会把端口写进 presigned URL）
- [ ] `MINIO_SECURE=true`
- [ ] `CORS_ALLOW_ORIGINS` 追加 `https://maxpeking.top`
      （当前值：`http://localhost:8081,http://127.0.0.1:8081,http://localhost:19000,http://127.0.0.1:19000,http://47.96.89.215:8000`）
- [ ] 重建后端（改 env 必须重建才生效）：
      ```bash
      cd /opt/psy_auto_ast
      nohup docker compose -f compose.prod.yaml up -d --build backend > /tmp/be_build.log 2>&1 &
      ```
      （pip 下载慢，约 25 分钟，用 nohup 防 SSH 断连）

### 4.4 验证后端产出已是 https

- [ ] 登录拿 token 后调 `GET /api/v1/files/{id}/download-url`，确认返回
      `https://oss.maxpeking.top/psy-auto-ast/...`（**不是** `http://47.96.89.215:9000/...`）
- [ ] 用返回的 URL 直接 `curl -I`，确认 200 且能取到 `Content-Length`
- [ ] 实测一次**大文件上传**（≥100MB 录音），确认 nginx 不再缓冲爆盘/超时

---

## 5. 客户端改造清单

### 5.1 Android（APK）

- [ ] 重新打包时注入 https 基址：
      ```bash
      export JAVA_HOME=/Users/apple/Library/Java/JavaVirtualMachines/corretto-17.0.15/Contents/Home
      export ANDROID_HOME=/Users/apple/Library/Android/sdk
      export EXPO_PUBLIC_API_BASE_URL=https://maxpeking.top/api/v1   # ← 改这一行
      cd apps/mobile/android && ./gradlew assembleRelease
      ```
- [ ] **收紧 cleartext**（可选但推荐）：`android/app/src/main/AndroidManifest.xml` 的
      `android:usesCleartextTraffic="true"` 改为 `false`。
      ⚠️ **`android/` 是 prebuild 产物**，直接改会被下次 `expo prebuild` 冲掉；
      要持久需改 `app.json` 的 `android` 段或用 `network_security_config`。
      **建议：先保留 true 做兼容，等 https 全量验证通过再单独收口这一步，并重新打 APK。**
- [ ] 验证进包（老规矩）：
      ```bash
      aapt2 dump xmltree app-release.apk --file AndroidManifest.xml | grep usesCleartextTraffic
      unzip -p app-release.apk assets/index.android.bundle | grep -a -c "maxpeking.top/api/v1"
      ```

### 5.2 iOS

- [ ] **移除 ATS 临时白名单**（现在有了 https 就不需要了）：
      - `apps/mobile/app.json` → 删掉
        `expo.ios.infoPlist.NSAppTransportSecurity.NSExceptionDomains`（`47.96.89.215` 那条）
      - `apps/mobile/ios/app/Info.plist` → 同步删掉 `NSExceptionDomains`
        （该文件 gitignored，重跑 `expo prebuild` 会按 app.json 重新生成）
- [ ] 重跑 `npx expo prebuild --platform ios` 让 app.json 的变更落到 Info.plist
- [ ] 用 PlistBuddy 确认产物里**已没有**例外：
      ```bash
      /usr/libexec/PlistBuddy -c "Print :NSAppTransportSecurity" \
        apps/mobile/ios/build/Build/Products/Debug-iphonesimulator/app.app/Info.plist
      ```
      （应只剩 `NSAllowsArbitraryLoads=false` / `NSAllowsLocalNetworking=true`）
- [ ] 重新构建时注入 https 基址：`EXPO_PUBLIC_API_BASE_URL=https://maxpeking.top/api/v1`

### 5.3 Web

- [x] **已完成（0901-1）**：`EXPO_PUBLIC_API_BASE_URL=https://maxpeking.top/api/v1 npx expo export --platform web`
- [ ] 本次迁移后**重跑一次** export，确保 bundle 里没有任何 `http://47.96.89.215`
- [ ] 部署方式（**别踩老坑**）：服务器用
      `find web -mindepth 1 -delete` 清空保留目录再解压，
      **不要** `rm -rf web && mkdir`（会让 bind mount 失效导致 `/` 403）

---

## 6. 安全收口（建议，非阻塞）

- [ ] **从安全组撤掉 MinIO 9000 公网端口**。
      现状：`http://47.96.89.215:9000/minio/health/live` 公网返回 200（整个对象存储裸奔在公网，
      只靠 presigned URL 保护）。迁移到 `oss.maxpeking.top` 反代后，9000 只需内网可达。
- [ ] 确认 `9001`（MinIO console）未暴露 —— 已确认不可达 ✅
- [ ] 后端 `8000` 端口同样可考虑撤公网（现在经 nginx `/api/` 反代即可）
- [ ] 关掉 IP 直连 HTTP：等新 APK/iOS 普及后，把 nginx 的 `default_server` 80 段也 301 到 https

---

## 7. 文档 / 脚本需同步（容易漏）

以下位置硬编码了 `http://47.96.89.215/api/v1`，迁移后需更新：

- [ ] `README.md`（多处）
      - L299 本地开发示例（**保留 http**，这是局域网/localhost，别改）
      - L365 Android 模拟器 `10.0.2.2`（**保留**，本地）
      - L519、L561、L593、L602、L611、L614 生产打包/部署示例 → 改 https
      - L642–643 下载页与 APK 直链 → 改 https
- [ ] `docs/production-deployment.md`
      - L194 `EXPO_PUBLIC_API_BASE_URL` 示例 → 改 https
      - L228 nginx 同源免 CORS 的说明 → 改 https 表述
- [ ] `scripts/`、`task_plan.md`、`progress.md`、`findings.md` 中的历史记录
      （**历史文档可只更新不强制**，但 `README.md` 的操作命令必须改，否则下次照抄会出错）

> 服务器下载页 `/opt/psy_auto_ast/apk/index.html` 用的是**相对路径** `app-release.apk?v=<tag>`，
> 无需改动；但页面文字里的构建号要随发版同步。

---

## 8. 回归验收清单（改完后逐条跑）

在 **Android 真机** 和 **iOS（模拟器/真机）** 各跑一遍：

- [ ] 登录（邮箱 + 密码）
- [ ] 新建录音 → 录音 → **上传成功**（验证 `PUT upload_url`）
- [ ] 录音列表点播放 → **能出声**（验证 `GET download_url`）
- [ ] 档案里上传附件（PDF/图片）→ **上传成功**
- [ ] 点附件预览 → **能显示**
- [ ] 点附件下载 → **能保存/分享**
- [ ] 生成报告/纪要 → **导出下载成功**
- [ ] Web 端（`https://maxpeking.top`）再跑一遍以上，确认无 Mixed Content 报错

---

## 9. 回滚方案

若迁移后 presigned URL 异常，最快的回滚是改回环境变量并重建：

```bash
# /opt/psy_auto_ast/.env
MINIO_ENDPOINT=47.96.89.215:9000
MINIO_SECURE=false
```
然后 `docker compose -f compose.prod.yaml up -d --build backend`（约 25 分钟）。

> 因为 DB 只存 `storage_key`，**回滚不会破坏任何历史数据**，
> 这也是为什么「改 endpoint 环境变量」是最小风险的做法。

---

## 附：当前状态速查（2026-09-01）

| 项 | 值 |
|---|---|
| 生产 `MINIO_ENDPOINT` | `47.96.89.215:9000` |
| 生产 `MINIO_SECURE` | `false` |
| 生产 `RECORDING_AUDIO_INPUT_MODE` | `base64`（AI 处理环节；但**文件上传本身仍走 presigned PUT**） |
| Android cleartext | `true`（`android/app/src/main/AndroidManifest.xml`） |
| iOS ATS 例外 | 有（`47.96.89.215`，临时） |
| Web API 基址 | `https://maxpeking.top/api/v1` ✅ 已 https |
| APK API 基址 | `http://47.96.89.215/api/v1` ❌ 待改 |
| 域名证书 | `maxpeking.top`（Let's Encrypt，2026-11-29 到期，已配自动续期） |
| MinIO 9000 公网 | 可达（安全组放行）⚠️ |
