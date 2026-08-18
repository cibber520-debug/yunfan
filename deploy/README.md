# 云帆志愿（yunfan-volunteer）CloudBase 部署落地手册

> 适用部署目标：**腾讯云 CloudBase** = 静态网站托管（前端 `dist/`） + 云托管 CloudBase Run（后端容器） + 云数据库 PostgreSQL。
> 本文档按架构任务 **T1 → T8** 顺序给出每一步可执行命令与控制台操作，并明确标注**必须用户在 CloudBase 控制台手动完成**的环节。
> 所有真实域名 / 密钥均用占位 `<...>`，请按实际值替换，切勿将密钥提交到仓库。

---

## 0. 部署文件清单（本目录与项目根）

| 文件 | 作用 |
|------|------|
| `server/Dockerfile` | 后端容器镜像（node:20-alpine + tsx 运行 TS 入口，监听 3001） |
| `server/.dockerignore` | 后端构建上下文排除（.env / node_modules / logs / dist 等） |
| `docker-compose.yml`（项目根） | 本地端到端联调（PostgreSQL + 后端） |
| `cloudbaserc.json`（项目根） | CloudBase 静态托管 CLI 配置（envId 占位 + 指向 dist） |
| `.env.production` / `.env.production.example`（项目根） | 前端生产构建变量（Vite build-time 注入） |
| `deploy/backend-env.example` | 云托管后端环境变量完整模板 |
| `deploy/init-db.sh` | 云 / 本地 PostgreSQL 初始化助手（schema + auth-schema + seed） |

> 既有文件（仅部署时引用，不改动）：`server/src/db/schema.sql`、`server/src/db/auth-schema.sql`、`server/scripts/seed-db.ts`、`server/package.json`、`server/src/index.ts`。

---

## 1. 前端构建配置（T4，本地可独立完成）

> 前置：本机 Node ≥ 20（managed node 22 可用），已安装 pnpm（项目要求 9.12.3）。

### 1.1 准备前端生产变量

```bash
# 项目根目录
cp .env.production.example .env.production
# 用编辑器打开 .env.production，将 VITE_API_BASE_URL 占位替换为真实云托管后端域名
# （T6 之后才能拿到真实域名，可先保留占位，构建出可部署的 dist/，T7 再回写重构建）
```

`.env.production` 内容示例：

```bash
VITE_DATA_SOURCE=api
VITE_API_BASE_URL=https://your-backend.ap-shanghai.run.tcloudbase.com
VITE_AUTH_ENABLED=true
```

### 1.2 安装依赖并构建

```bash
# 项目根目录
# 若 node_modules 不存在则先安装（pnpm 会按 pnpm-lock.yaml 安装）
pnpm install
pnpm build
```

- 构建产物输出到 `dist/`（`base: './'` 已配置，便于静态托管子路径 / 自定义域名）。
- 确认产物：`dist/index.html` 与 `dist/assets/*` 存在。

---

## 2. 后端容器化（T1）

> 后端入口已核实为 `server/src/index.ts`；`server/tsconfig.json` 为 `noEmit:true` + `moduleResolution:Bundler`，**无法 `tsc` 编译后 node 直跑**，故镜像内用 `npx tsx src/index.ts` 运行（与 `package.json` 的 `start` 脚本一致）。`tsx` 当前是 devDependency，已在 Dockerfile 中 `npm install tsx@4.19.2 --no-save` 补齐运行期依赖。

### 2.1 本地构建镜像（需 Docker daemon）

```bash
# 项目根目录
docker build -f server/Dockerfile -t yunfan-backend ./server
```

### 2.2 仅用 seed 模式快速验证镜像可启动（无 PG 也能起服务）

```bash
# 用临时容器以 DATA_SOURCE=seed 启动，验证 /api/v1/health 返回 200
docker run --rm -e DATA_SOURCE=seed -e PORT=3001 -p 3001:3001 yunfan-backend
# 另开终端：
curl -fsS http://127.0.0.1:3001/api/v1/health
```

> 控制台手动环节：无。T1 的镜像构建可在本地或 CloudBase 控制台「云托管」关联仓库时完成（见 T6）。

---

## 3. 本地端到端联调（T2，需 Docker）

```bash
# 项目根目录
docker compose up -d
# 等待 db 健康检查通过、backend 启动

# 手动初始化种子数据（幂等，可重复运行）
docker compose exec backend npm run db:seed

# 冒烟测试
curl -fsS http://localhost:3001/api/v1/health
curl -fsS http://localhost:3001/api/v1/reference-data | head
```

- 前端本地联调用 `pnpm dev`（读 `.env.development`，指向 `http://127.0.0.1:3001`）。
- 停止：`docker compose down`（保留数据卷 `pgdata`）；`docker compose down -v` 清空数据库。

---

## 4. 云 PostgreSQL 建库与初始化（T3，[控制台手动] + 脚本）

### 4.1 控制台手动（必须）

1. 登录腾讯云控制台，创建**云数据库 PostgreSQL** 实例（建议与 CloudBase Run **同地域/同 VPC**，确保内网互通）。
2. 创建数据库 `yunfan`（字符集 `UTF8`），记录：
   - 实例内网 / 公网地址 → `PGHOST`
   - 高权账号与密码 → `PGUSER` / `PGPASSWORD`
   - 库名 `yunfan` → `PGDATABASE`
3. 若走公网，请在安全组开放 5432 仅允许云托管出口 IP（或开启内网互通，优先内网）。

### 4.2 初始化 schema 与 seed

```bash
# 方式 A：用本仓库 init-db.sh（推荐，幂等可重复）
PGHOST=<云PG地址> PGPORT=5432 PGUSER=<账号> PGPASSWORD=<密码> PGDATABASE=yunfan \
  bash deploy/init-db.sh

# 方式 B：本地 server 直接 seed（需 server 已 npm ci）
PGHOST=<云PG地址> PGPORT=5432 PGUSER=<账号> PGPASSWORD=<密码> PGDATABASE=yunfan \
  bash -c 'cd server && npm run db:seed'

# 方式 C：腾讯云 DMC 在线 SQL 窗口手动执行
#   依次执行 server/src/db/schema.sql 与 server/src/db/auth-schema.sql
```

> 验收：云 PG 中存在 `data_version`（active 指针）、`app_user`、`auth_session` 等表，且 `data_version.active = true` 有一条种子版本。

---

## 5. 静态网站托管（T5，[控制台手动] + CLI 上传）

### 5.1 控制台手动（必须）

1. 在 CloudBase 控制台开通**静态网站托管**，记录静态站域名，形如：
   `https://<envId>.tcloudbaseapp.com`
2. （可选）绑定自定义域名并上传 HTTPS 证书。

### 5.2 上传 dist/

```bash
# 登录 CloudBase（需安装 @cloudbase/cli：npm i -g @cloudbase/cli）
tcb login

# 上传 dist/ 到静态托管（envId 替换为真实环境 ID；本仓库 cloudbaserc.json 仅含 hosting 配置，localPath=dist）
tcb hosting deploy dist -e <your-env-id>
```
> 说明（重要）：后端云托管容器**不通过 framework CLI 部署**，而是在 CloudBase 控制台「云托管」**手动**创建服务——
> 读取 `server/Dockerfile` 构建镜像、监听端口 `3001`、健康检查路径 `GET /api/v1/health`、按 `deploy/backend-env.example` 注入环境变量（见 §6）。
> 因此**不要使用**依赖 `framework` 的 `tcb framework deploy` 命令（本仓库 cloudbaserc.json 无 `framework` 键，该命令无效）。

> 验收：浏览器访问静态站域名，页面正常加载（此时因 `VITE_API_BASE_URL` 还是占位，数据接口可能 404，待 T6/T7 补齐）。

---

## 6. 云托管后端部署（T6，[控制台手动] 注入变量）

### 6.1 控制台手动（必须）

1. CloudBase 控制台开通**云托管（CloudBase Run）**，新建服务：
   - 来源：关联代码仓库并读取 `server/Dockerfile` 构建，或本地 `docker build` 推送到 TCR 后部署。
   - **监听端口：3001**（与 `EXPOSE 3001` / `PORT` 一致）。
   - **健康检查：`GET /api/v1/health`**。
   - 实例与云 PG 同地域 / 同 VPC（内网互通）。
2. 在「环境变量」录入 `deploy/backend-env.example` 中**全部变量**，重点：
   - `DATA_SOURCE=postgres`
   - `PGHOST` / `PGPORT=5432` / `PGUSER` / `PGPASSWORD` / `PGDATABASE=yunfan`
   - `CORS_ORIGIN=https://<envId>.tcloudbaseapp.com`（即 T5 静态站域名，**必须互为白名单**）
   - `NODE_ENV=production`、`PORT=3001`
   - `AUTH_COOKIE_SAME_SITE=none`
   - `AUTH_SESSION_SECRET` / `AUTH_CODE_PEPPER`：**必填随机值**，用下方命令生成后粘贴
   - `DEEPSEEK_API_KEY`：可选（空则自动降级本地引擎）
3. 部署完成后记录后端域名，形如：
   `https://<backend>.ap-shanghai.run.tcloudbase.com`

### 6.2 生成随机密钥

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 分别为 AUTH_SESSION_SECRET 与 AUTH_CODE_PEPPER 生成并粘贴到控制台
```

> 验收：
> ```bash
> curl -fsS https://<backend>.ap-shanghai.run.tcloudbase.com/api/v1/health
> ```

---

## 7. 回写并重新构建前端（T7）

1. 将 `.env.production` 的 `VITE_API_BASE_URL` 改为 T6 取得的前端可访问的**真实后端域名**：
   ```bash
   # 项目根
   # 编辑 .env.production
   VITE_API_BASE_URL=https://<backend>.ap-shanghai.run.tcloudbase.com
   ```
2. 重新构建并重新上传：
   ```bash
   pnpm build
   tcb hosting deploy dist -e <your-env-id>
   ```
3. 确认后端 `CORS_ORIGIN` 已包含静态站域名（T6 第 2 步）。

---

## 8. 生产冒烟测试（T8）

```bash
BASE=https://<backend>.ap-shanghai.run.tcloudbase.com   # 云托管后端域名
# 或浏览器直接访问静态站域名，由前端发起跨域请求

# 1) 健康检查
curl -fsS $BASE/api/v1/health

# 2) 引用数据
curl -fsS $BASE/api/v1/reference-data | head

# 3) 位次反查（示例参数，按实际接口字段调整）
curl -fsS -X POST $BASE/api/v1/rank-lookup \
  -H 'Content-Type: application/json' \
  -d '{"provinceCode":"11","examYear":2026,"score":600}'

# 4) 志愿推荐生成（示例参数）
curl -fsS -X POST $BASE/api/v1/recommendations/generate \
  -H 'Content-Type: application/json' \
  -d '{"provinceCode":"11","score":600,"examYear":2026,"preference":{}}'

# 5) 认证：发送验证码
curl -fsS -X POST $BASE/api/v1/auth/send-code \
  -H 'Content-Type: application/json' \
  -d '{"contact":"test@example.com","purpose":"REGISTER"}'
# 6) 注册 / 登录（验证码由 MAIL_TRANSPORT=console 时打印在后端日志）
curl -fsS -X POST $BASE/api/v1/auth/register \
  -H 'Content-Type: application/json' -c cookies.txt \
  -d '{"contact":"test@example.com","code":"<日志中的验证码>","displayName":"测试"}'
curl -fsS $BASE/api/v1/auth/me -b cookies.txt
```

> 验收：health 返回 200；reference-data 有数据；rank-lookup / recommendations 正常；auth 注册/登录成功后 `Set-Cookie` 写入 `yunfan_session`，且跨域 Cookie 在 `AUTH_COOKIE_SAME_SITE=none` + HTTPS 下可用。

---

## 9. 必须用户在 CloudBase 控制台手动完成的清单（汇总）

- [ ] 创建 CloudBase 环境（记录 `envId` → 回填 `cloudbaserc.json` 与 CLI 命令）
- [ ] 创建云 PostgreSQL 实例（同地域/VPC），建库 `yunfan`
- [ ] 控制台注入敏感环境变量（`PGPASSWORD` / `DEEPSEEK_API_KEY` / `AUTH_SESSION_SECRET` / `AUTH_CODE_PEPPER`）
- [ ] 配置自定义域名 + HTTPS（可选）
- [ ] 云托管创建服务，使用 `server/Dockerfile`，监听 3001，健康检查 `/api/v1/health`
- [ ] 回写 `VITE_API_BASE_URL`（前端）与 `CORS_ORIGIN`（后端），二者互为白名单

---

## 10. 本地验证速查（无 Docker / 无 tcb 环境）

- 前端构建：`pnpm build` 本地可独立验证 `dist/` 产出。
- 后端 seed 模式自测（无需 PG）：
  ```bash
  cd server && npm ci
  DATA_SOURCE=seed PORT=3001 npx tsx src/index.ts &
  sleep 3
  curl -fsS http://127.0.0.1:3001/api/v1/health
  curl -fsS http://127.0.0.1:3001/api/v1/reference-data | head
  kill %1
  ```
- 配置合法性：`node -e "JSON.parse(require('fs').readFileSync('cloudbaserc.json','utf8'))"`，以及（有 docker 时）`docker compose -f docker-compose.yml config`。
- 无 Docker daemon / 无 tcb CLI 时，跳过对应步骤并在交付说明中标注即可，不阻塞产出。
