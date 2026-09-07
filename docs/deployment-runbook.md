# 服务器部署与 Android APK 构建手册

> 本文件是本项目部署操作的唯一权威入口。涉及线上 Web、后端、数据库迁移或本地 APK 构建时，先阅读本文件，再执行命令。
>
> 生产域名：`https://maxpeking.top`  
> 服务器目录：`/opt/psy_auto_ast`  
> 生产编排文件：`/opt/psy_auto_ast/compose.prod.yaml`（仓库副本为 `server/compose.prod.yaml`）

## 1. 基本原则

- Web、API、MinIO 对外地址统一使用 HTTPS；不要再把 `http://47.96.89.215` 编译进新产物。
- 后端是 Docker 镜像构建：Python 代码变化后必须重新 build，单纯覆盖服务器文件不会生效。
- Web 是 nginx 只读挂载目录：更新 `/opt/psy_auto_ast/web` 内的静态文件即可。
- 数据库迁移由新后端镜像执行，顺序必须是：构建镜像 → 迁移 → 启动新后端。
- `requirements.txt` 未变化时正常 build 即可，Docker 会复用依赖层；不要无故使用 `--no-cache`。
- 标准部署不会清理业务数据。任何“保留用户、清空测试业务数据”的操作都必须单独备份、单独确认，不能夹在普通部署命令中。
- `.env`、SSH 凭据、数据库密码、JWT、邮件/短信/百炼密钥不得进入 Git、压缩包或本文档。
- APK 默认只在本地生成；除非用户明确要求，不上传服务器下载页。

## 2. 部署前检查

在本机仓库根目录执行：

```bash
cd /Users/apple/WeChatProjects/psy_auto_ast
git status --short
git log -1 --oneline
git diff --check

python3 -m compileall -q backend/app backend/alembic/versions

cd apps/mobile
npm run typecheck
npm test
```

如有数据库模型或迁移变化，再运行相关后端测试。测试数据库由本机 Docker PostgreSQL 提供：

```bash
cd /Users/apple/WeChatProjects/psy_auto_ast
open -a Docker
docker compose up -d postgres
./venv/bin/pytest -q backend/tests
```

已知测试失败必须记录原因；本次功能相关测试未通过时不得部署。

## 3. 生产备份

先确认服务器可连接，并查看当前容器：

```bash
ssh root@47.96.89.215
cd /opt/psy_auto_ast
docker compose -f compose.prod.yaml ps
```

每次后端部署前至少备份生产数据库和当前后端目录：

```bash
cd /opt/psy_auto_ast
deploy_stamp=$(date +%Y%m%d_%H%M%S)
mkdir -p "backups/${deploy_stamp}"

docker compose -f compose.prod.yaml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > "backups/${deploy_stamp}/database.sql.gz"

tar -czf "backups/${deploy_stamp}/backend.tar.gz" backend
tar -czf "backups/${deploy_stamp}/web.tar.gz" web

test -s "backups/${deploy_stamp}/database.sql.gz"
ls -lh "backups/${deploy_stamp}"
```

不要把备份下载到公开 Web 或 APK 目录。

## 4. 后端发布包上传

后端应整体同步，确保新增的 Alembic 迁移、模型、路由和服务文件不会漏传。本机执行：

```bash
cd /Users/apple/WeChatProjects/psy_auto_ast

COPYFILE_DISABLE=1 tar -czf /tmp/psy-backend-release.tar.gz \
  --exclude='backend/.env' \
  --exclude='backend/.venv' \
  --exclude='backend/__pycache__' \
  --exclude='backend/.pytest_cache' \
  backend

scp /tmp/psy-backend-release.tar.gz root@47.96.89.215:/tmp/
```

服务器上采用可回滚替换，不直接删除旧目录：

```bash
cd /opt/psy_auto_ast
release_stamp=$(date +%Y%m%d_%H%M%S)
mkdir -p "/tmp/psy-backend-${release_stamp}"
tar -xzf /tmp/psy-backend-release.tar.gz -C "/tmp/psy-backend-${release_stamp}"

mv backend "backups/backend-before-${release_stamp}"
mv "/tmp/psy-backend-${release_stamp}/backend" backend
rm -f /tmp/psy-backend-release.tar.gz
```

生产环境变量位于服务器 `/opt/psy_auto_ast/.env`，不在 `backend/` 内，因此上述替换不会覆盖密钥。

## 5. 后端构建、迁移与启动

服务器执行：

```bash
cd /opt/psy_auto_ast

# 1. 构建包含最新代码和迁移的新镜像。
docker compose -f compose.prod.yaml build backend

# 2. 用新镜像执行迁移；失败时停止，不启动新后端。
docker compose -f compose.prod.yaml run --rm backend alembic upgrade head

# 3. 启动新后端。
docker compose -f compose.prod.yaml up -d backend

# 4. 查看状态和最近日志。
docker compose -f compose.prod.yaml ps backend
docker compose -f compose.prod.yaml logs --tail=120 backend
```

本次历程级转写/纪要功能要求生产迁移至少到：

```text
f6a8b0c2d4e7
```

验证容器内迁移版本：

```bash
docker compose -f compose.prod.yaml exec -T backend alembic current
```

说明：Dockerfile 先复制 `requirements.txt` 并安装依赖，再复制业务代码。依赖文件不变且缓存存在时，`pip install` 层会直接命中缓存；只有缓存失效、构建机变化或使用 `--no-cache` 时才会重新安装。

## 6. Web 构建与部署

本机使用 HTTPS API 构建：

```bash
cd /Users/apple/WeChatProjects/psy_auto_ast/apps/mobile

EXPO_PUBLIC_API_BASE_URL=https://maxpeking.top/api/v1 \
  npx expo export --platform web --output-dir dist

# 防止 macOS 的 ._* 资源叉进入服务器目录。
COPYFILE_DISABLE=1 tar -czf /tmp/psy-web-release.tar.gz -C dist .
scp /tmp/psy-web-release.tar.gz root@47.96.89.215:/tmp/
```

如本次构建有 `BUILD_TAG`，先在本机确认新静态包确实包含它：

```bash
grep -R "0907-1" dist/_expo dist/index.html
```

服务器执行：

```bash
cd /opt/psy_auto_ast
web_stamp=$(date +%Y%m%d_%H%M%S)
tar -czf "backups/web-before-${web_stamp}.tar.gz" web

# 保留 web 目录本身，避免破坏 nginx bind mount。
find web -mindepth 1 -delete
tar -xzf /tmp/psy-web-release.tar.gz -C web
find web -name '._*' -delete
rm -f /tmp/psy-web-release.tar.gz

docker exec psy-auto-ast-web-1 nginx -t
docker exec psy-auto-ast-web-1 nginx -s reload
```

只有 `server/nginx.conf` 或 `server/compose.prod.yaml` 发生变化时，才同步它们并强制重建 Web 容器：

```bash
docker compose -f compose.prod.yaml up -d --force-recreate web
```

原因：服务器用只读 bind mount 挂载 nginx 配置；文件 inode 被替换后，单纯 reload 可能仍读取旧文件。

## 7. 线上验收

在本机执行：

```bash
curl -fsS https://maxpeking.top/api/v1/health
curl -fsSI https://maxpeking.top/
curl -fsSI https://maxpeking.top/apk/
```

健康接口应返回 HTTP 200，且 API、数据库、对象存储均为正常状态。继续核对：

- Web 登录页能打开，无 Mixed Content 或 CORS 报错。
- 浏览器网络请求指向 `https://maxpeking.top/api/v1`。
- 登录、档案列表和本次改动的关键流程可正常访问。
- 后端日志没有数据库字段缺失、迁移失败或持续 5xx。
- 如果发布含新 `BUILD_TAG`，线上 JS bundle 能检索到该标识。

服务器侧快速检查：

```bash
cd /opt/psy_auto_ast
docker compose -f compose.prod.yaml ps
docker compose -f compose.prod.yaml logs --tail=200 backend
```

## 8. 本地构建 Android APK

必须使用 JDK 17。

> **不要直接 `./gradlew clean assembleRelease`**：React Native 的已知坑——`clean` 任务会**提前触发 cmake 重新生成**，而此时 codegen 尚未执行，`@react-native-community/datetimepicker` 的 `android/build/generated/source/codegen/jni/` 目录不存在，cmake 配置会 `add_subdirectory ... not an existing directory` 崩溃（BUILD FAILED）。正确做法是手动删掉陈旧 native 缓存后只跑 `assembleRelease`，让 cmake 配置排在 codegen 之后执行：

```bash
cd /Users/apple/WeChatProjects/psy_auto_ast/apps/mobile

export JAVA_HOME=/Users/apple/Library/Java/JavaVirtualMachines/corretto-17.0.15/Contents/Home
export ANDROID_HOME=/Users/apple/Library/Android/sdk
export EXPO_PUBLIC_API_BASE_URL=https://maxpeking.top/api/v1
export GRADLE_OPTS="-Xmx4096m -XX:MaxMetaspaceSize=1024m"

# 手动清除陈旧 native 构建缓存（等价于 clean，但避开 cmake 提前配置）
rm -rf android/app/.cxx android/app/build

cd android
./gradlew assembleRelease
```

默认产物：

```text
/Users/apple/WeChatProjects/psy_auto_ast/apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

构建完成后验证：

```bash
apk_path=/Users/apple/WeChatProjects/psy_auto_ast/apps/mobile/android/app/build/outputs/apk/release/app-release.apk

test -s "$apk_path"
ls -lh "$apk_path"
shasum -a 256 "$apk_path"

unzip -p "$apk_path" assets/index.android.bundle \
  | grep -a -c 'https://maxpeking.top/api/v1'

unzip -p "$apk_path" assets/index.android.bundle \
  | grep -a -c 'http://47.96.89.215'
```

预期：HTTPS API 至少出现一次，旧 HTTP IP 地址出现 0 次。还应在手机“我的”页核对 `BUILD_TAG`。

当前 release 使用项目现有的 debug keystore，可直接安装测试，但不适合作为应用商店正式签名包。APK 构建不等于上传；上传下载页必须由用户另行明确要求。

## 9. 回滚

### 后端回滚

恢复部署前备份目录，然后重新 build：

```bash
cd /opt/psy_auto_ast
docker compose -f compose.prod.yaml stop backend
mv backend "backend-failed-$(date +%Y%m%d_%H%M%S)"
rollback_stamp=20260907_120000  # 替换为部署时记录的时间戳
mv "backups/backend-before-${rollback_stamp}" backend
docker compose -f compose.prod.yaml up -d --build backend
```

数据库是否降级必须根据迁移内容单独判断。默认不要执行 `alembic downgrade`；优先回滚兼容代码或从部署前数据库备份恢复。

### Web 回滚

```bash
cd /opt/psy_auto_ast
find web -mindepth 1 -delete
rollback_stamp=20260907_120000  # 替换为部署时记录的时间戳
tar -xzf "backups/web-before-${rollback_stamp}.tar.gz"
docker exec psy-auto-ast-web-1 nginx -s reload
```

## 10. 测试数据清理边界

普通部署不执行清库。若测试阶段需要“保留用户账户、清空其他业务数据”，必须满足：

1. 已生成并验证 `pg_dump` 备份。
2. 先根据当前外键关系生成和审查清理 SQL。
3. 明确保留 `users`、认证身份及必要账户设置的表。
4. 在事务中执行，核对删除前后行数后再提交。
5. MinIO 对象清理另行执行，不能只删数据库记录。

没有经过当次确认时，不执行该操作，也不要使用 `docker compose down -v`、`DROP DATABASE` 或清空整个数据卷。

## 11. 相关配置文件

- `server/compose.prod.yaml`：生产容器拓扑。
- `server/nginx.conf`：HTTPS、Web、API、MinIO 与 APK 路由。
- `backend/Dockerfile`：后端镜像构建顺序和依赖缓存边界。
- `backend/alembic/versions/`：数据库迁移。
- `apps/mobile/src/api/apiConfig.ts`：前端 API 地址与 Android HTTPS 兜底。
- `apps/mobile/app.json`：包名、版本号、图标和 Android 网络策略。
- `docs/production-deployment.md`：生产架构、环境变量和上线前检查背景资料；实际操作以本文件为准。
