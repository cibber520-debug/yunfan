# 云帆志愿后端实现交付概要

> 基于 `deliverables/backend-architecture-prompt-system.md` 中的后端架构方案落地实现。
> 方案明确：数据库用 **PostgreSQL**；三个核心接口 `GET /api/v1/reference-data`、`POST /api/v1/rank-lookup`、`POST /api/v1/recommendations/generate`。

## 已实现（阶段一 · 无数据库通路）

- **技术栈**：Node.js 22 + TypeScript + Express + CORS，用 `tsx` 直接运行，无需打包。
- **存储抽象**：`Repository` 接口，默认 `SeedRepository` 直接返回内嵌写死测试数据（与前端 `src/data/mock/*.json` 同源），不依赖任何数据库。
- **三个接口全部打通并验证**：
  - `GET /api/v1/reference-data` → 省份投档规则 / 地区 / 专业 / 选项目录
  - `POST /api/v1/rank-lookup` → 按省+科类+分数反查省位次（精确分段命中 `REFERENCE_DATA`，否则线性估算并标注 `ESTIMATE`）
  - `POST /api/v1/recommendations/generate` → 按草稿做选科/性质/专业黑名单/地域硬过滤，形成冲稳保垫四档，约束不足时 L1/L2 降级
- **契约对齐前端**：响应结构严格匹配 `src/types/api.ts` 与 `apiGuards.ts`，前端 6 个 API 契约测试全部通过。
- **安全/健壮性**：统一错误（INVALID_INPUT=400 / NOT_FOUND=404 / TEMPORARY_FAILURE=500）、请求级 requestId 日志（仅进日志、不作指标标签）、开发态 CORS 全开、生产态按 `CORS_ORIGIN` 白名单收紧、JSON 体积限制。
- **前端联动**：新增 `.env.development`（`VITE_DATA_SOURCE=api` + `VITE_API_BASE_URL=http://localhost:3001`），仅 `pnpm dev` 生效，**不影响 `pnpm test`**；此时前端「先拉取后端数据、收到后才渲染」。

## 已实现（阶段二 · 数据库功能）

- **PostgreSQL 逻辑模型** `server/src/db/schema.sql`：不可变 `data_version`（active 指针原子切换）+ `province_rule` / `score_segment` / `candidate` 三张核心表，外加方案中列出的 `school/major/subject_requirement/admission_history/enrollment_plan/...` 扩展实体（预留）。
- **PostgresRepository** `server/src/repository/postgres.ts`：只读 active 版本数据，版本可追溯、可回滚。
- **seed-db 脚本** `server/scripts/seed-db.ts`：把写死测试数据写入 PostgreSQL 并置为 active 版本，可重复执行（先清后写）。
- **切换方式**：`server/.env` 中 `DATA_SOURCE=postgres`（默认 `seed`）。
- 当前本机未安装 PostgreSQL，故阶段二代码已完成并通过 `tsc` 类型校验，但需在安装 PG 后实跑（见下）。

## 已实现（阶段三 · 大模型生成）

- **大模型接入**：`server/src/services/llmClient.ts` 封装 DeepSeek（OpenAI 兼容）`/chat/completions` 调用，支持 `response_format=json_object`、超时（AbortController）与 `LlmError` 错误类型；模型默认 `deepseek-v4-flash`，由 `LLM_MODEL` 配置。
- **提示词整合**：`server/src/services/recommendationPrompt.ts` 将用户草稿 + 参考数据 + 候选池整合为 system/user 提示词，要求大模型**只从候选池中选择**、输出 `items` / `strictItems` / `degradation` 的 JSON。
- **服务端流程**：`recommendationService.generate()` 优先走大模型 → 解析 → 字段清洗（仅保留候选池内 id、用候选池规范校名/专业名）→ 封装为与测试数据同构的 `GenerateRecommendationResponse` 信封（dataVersion/updatedAt/profile/generatedAt/disclaimer）。
- **健壮降级**：大模型不可用（无 `DEEPSEEK_API_KEY`、`USE_LLM=false`、网络/解析/梯度不完整）时自动回退本地引擎，并标记 `degradation.level='L5'`（仅在确实尝试过 LLM 时）；无密钥场景不误报降级。
- **前端等待动画**：点击「生成志愿方案」后、收到响应前，全屏播放 `GenerationLoadingOverlay`（旋转轨道 + 冲/稳/保/垫浮标 + 阶段文案 + 进度条），由 `WizardPage` 在 `submitBusy` 期间渲染。
- **配置**：`server/.env` 新增 `USE_LLM` / `DEEPSEEK_API_KEY` / `LLM_MODEL` / `LLM_BASE_URL` / `LLM_TIMEOUT_MS`；密钥缺失时 `config.llm.enabled` 自动为 false。

## 如何运行

```bash
# 阶段一（默认，无需数据库）
cd server
npm install
npm run dev            # 监听 http://localhost:3001

# 另开终端启动前端（走真实后端）
cd ..
pnpm install
pnpm dev               # 打开 Vite 提示的地址，前端将先请求后端再渲染

# 阶段二（需先安装 PostgreSQL）
# 1) 建库 + 建表：  psql -U postgres -f server/src/db/schema.sql
# 2) 写入演示数据： cd server && npm run db:seed
# 3) 改 server/.env：DATA_SOURCE=postgres，并确认 PG* 连接参数
# 4) npm run dev
```

## 验证结果

- `tsc --noEmit` 全量通过（含 postgres / seed-db）。
- 三接口 curl 实测：reference-data 返回 4 省 / 5 地区 / 7 专业；rank-lookup 精确 612→15230、估算 640→3800；recommendations 返回 9 条且冲稳保垫齐全。
- 错误路径：分数越界→400，未就绪省份→404。
- 前端 `src/services/api/index.test.ts` **6/6 通过**，证明后端契约与前端期望一致。

## 备注 / 后续

- 阶段二因本机无 PostgreSQL 未实跑，仅完成代码与类型校验；安装 PG 后按上面步骤即可启用。
- 写死数据目前前后端各存一份（前端 `src/data/mock`、后端 `server/src/data`）。接入真实数据后应以数据库/数据管线为唯一来源。
- 推荐引擎当前为演示级（基于候选集过滤+估算），与架构方案中“离线候选快照+在线打分+多级降级”的深化方向一致，可作为下一步。
