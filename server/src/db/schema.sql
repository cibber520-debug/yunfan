-- 云帆志愿后端 · PostgreSQL 逻辑模型（阶段二）
-- 设计要点（与后端架构方案一致）：
--   1) 不可变数据版本：data_version 用单一 active 指针原子切换；在线只读 active 版本。
--   2) 按 province_code + exam_year 的业务语义分区（演示数据 exam_year 隐含在版本中，生产按规划分区）。
--   3) 引用数据、位次段、候选集三张核心表均由 data_version_id 关联，保证推荐结果与数据版本可追溯、可回滚。
--   4) subject_rule / tags / required_subjects 等半结构化字段用 jsonb，便于演进且不破坏范式主键。

-- ---------------- 数据版本（不可变组合版本的 active 指针） ----------------
CREATE TABLE IF NOT EXISTS data_version (
  id            BIGSERIAL PRIMARY KEY,
  version_label TEXT NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  disclaimer    TEXT NOT NULL DEFAULT '',
  active        BOOLEAN NOT NULL DEFAULT false,
  snapshot_hash TEXT,
  notes         TEXT,
  CONSTRAINT uq_data_version_label UNIQUE (version_label)
);

-- ---------------- 引用数据：省份投档规则 ----------------
CREATE TABLE IF NOT EXISTS province_rule (
  code            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  exam_type       TEXT NOT NULL,
  max_score       INTEGER NOT NULL CHECK (max_score > 0),
  ready           BOOLEAN NOT NULL DEFAULT false,
  rule_summary    TEXT NOT NULL DEFAULT '',
  subject_rule    JSONB NOT NULL,
  max_bonus_score INTEGER NOT NULL DEFAULT 0,
  data_version_id BIGINT NOT NULL REFERENCES data_version(id)
);

-- ---------------- 引用数据：选项目录（科目/层次/性质/学科门类/身份） ----------------
CREATE TABLE IF NOT EXISTS option_item (
  id         BIGSERIAL PRIMARY KEY,
  catalog    TEXT NOT NULL,            -- subjects | schoolTiers | ownership | majorCategories | identities
  code       TEXT NOT NULL,
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_option_item_catalog ON option_item (catalog, sort_order);

-- ---------------- 引用数据：地区 / 专业名 列表 ----------------
CREATE TABLE IF NOT EXISTS reference_region ( id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE );
CREATE TABLE IF NOT EXISTS reference_major  ( id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE );

-- ---------------- 位次反查：一分一段 ----------------
CREATE TABLE IF NOT EXISTS score_segment (
  id             BIGSERIAL PRIMARY KEY,
  province       TEXT NOT NULL,
  exam_type      TEXT NOT NULL,
  score          INTEGER NOT NULL,
  rank           INTEGER NOT NULL,
  lower          INTEGER NOT NULL,
  upper          INTEGER NOT NULL,
  data_version_id BIGINT NOT NULL REFERENCES data_version(id)
);
CREATE INDEX IF NOT EXISTS idx_score_segment_lookup ON score_segment (province, exam_type, score);
CREATE INDEX IF NOT EXISTS idx_score_segment_version ON score_segment (data_version_id);

-- ---------------- 推荐候选集 ----------------
CREATE TABLE IF NOT EXISTS candidate (
  id               TEXT PRIMARY KEY,
  province         TEXT NOT NULL,
  exam_type        TEXT NOT NULL,
  school_name      TEXT NOT NULL,
  major_name       TEXT NOT NULL,
  group_name       TEXT NOT NULL,
  tier             TEXT NOT NULL,            -- REACH | MATCH | SAFE | CUSHION
  probability      NUMERIC(5,2) NOT NULL,
  confidence       NUMERIC(3,2) NOT NULL,
  last_rank        INTEGER NOT NULL,
  school_tier      TEXT NOT NULL,
  ownership        TEXT NOT NULL,            -- PUBLIC | PRIVATE
  region           TEXT NOT NULL,
  tags             JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason           TEXT NOT NULL,
  predicted        BOOLEAN NOT NULL DEFAULT false,
  required_subjects JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_version_id  BIGINT NOT NULL REFERENCES data_version(id)
);
CREATE INDEX IF NOT EXISTS idx_candidate_lookup ON candidate (province, exam_type, data_version_id);
CREATE INDEX IF NOT EXISTS idx_candidate_version ON candidate (data_version_id);

-- ===================================================================
-- 以下为后端架构方案中列出的扩展实体（当前三个接口未使用，预留）
-- ===================================================================

CREATE TABLE IF NOT EXISTS school (
  id            BIGSERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  school_tier   TEXT,
  ownership     TEXT,
  province      TEXT,
  data_version_id BIGINT NOT NULL REFERENCES data_version(id)
);

CREATE TABLE IF NOT EXISTS major (
  id      BIGSERIAL PRIMARY KEY,
  code    TEXT NOT NULL UNIQUE,
  name    TEXT NOT NULL,
  category TEXT,
  data_version_id BIGINT NOT NULL REFERENCES data_version(id)
);

CREATE TABLE IF NOT EXISTS school_major_group (
  id          BIGSERIAL PRIMARY KEY,
  school_id   BIGINT NOT NULL REFERENCES school(id),
  group_code  TEXT NOT NULL,
  group_name  TEXT NOT NULL,
  data_version_id BIGINT NOT NULL REFERENCES data_version(id)
);

CREATE TABLE IF NOT EXISTS subject_requirement (
  id          BIGSERIAL PRIMARY KEY,
  target_type TEXT NOT NULL,           -- school_major_group | major
  target_id   TEXT NOT NULL,
  subjects    JSONB NOT NULL DEFAULT '[]'::jsonb,
  mode        TEXT NOT NULL,           -- FIRST_SECOND | ANY | FIXED
  data_version_id BIGINT NOT NULL REFERENCES data_version(id)
);

CREATE TABLE IF NOT EXISTS admission_history (
  id            BIGSERIAL PRIMARY KEY,
  school_id     BIGINT NOT NULL REFERENCES school(id),
  major_id      BIGINT REFERENCES major(id),
  exam_year     INTEGER NOT NULL,
  province      TEXT NOT NULL,
  exam_type     TEXT NOT NULL,
  admission_rank INTEGER,
  data_version_id BIGINT NOT NULL REFERENCES data_version(id)
);

CREATE TABLE IF NOT EXISTS enrollment_plan (
  id            BIGSERIAL PRIMARY KEY,
  school_id     BIGINT NOT NULL REFERENCES school(id),
  major_id      BIGINT REFERENCES major(id),
  exam_year     INTEGER NOT NULL,
  province      TEXT NOT NULL,
  exam_type     TEXT NOT NULL,
  plan_count    INTEGER,
  data_version_id BIGINT NOT NULL REFERENCES data_version(id)
);

-- 考生画像 / 偏好 / 推荐运行 / 志愿表（写接口扩展时使用，预留）
CREATE TABLE IF NOT EXISTS candidate_profile (
  id            BIGSERIAL PRIMARY KEY,
  external_id   TEXT NOT NULL UNIQUE,
  province      TEXT NOT NULL,
  exam_type     TEXT NOT NULL,
  total_score   INTEGER,
  province_rank INTEGER,
  subjects      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preference (
  id            BIGSERIAL PRIMARY KEY,
  profile_id    BIGINT NOT NULL REFERENCES candidate_profile(id),
  school_tiers  JSONB NOT NULL DEFAULT '[]'::jsonb,
  ownership     TEXT,
  rejected_regions JSONB NOT NULL DEFAULT '[]'::jsonb,
  blacklisted_majors JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recommendation_run (
  id               BIGSERIAL PRIMARY KEY,
  run_id           TEXT NOT NULL UNIQUE,
  profile_id       BIGINT REFERENCES candidate_profile(id),
  release_bundle_id TEXT NOT NULL,     -- 绑定不可变版本组合
  data_version     TEXT NOT NULL,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  degradation_level TEXT
);

CREATE TABLE IF NOT EXISTS recommendation_result (
  id              BIGSERIAL PRIMARY KEY,
  run_id          BIGINT NOT NULL REFERENCES recommendation_run(id),
  candidate_id    TEXT NOT NULL,
  tier            TEXT NOT NULL,
  probability     NUMERIC(5,2),
  confidence      NUMERIC(3,2),
  strict          BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS volunteer_plan (
  id            BIGSERIAL PRIMARY KEY,
  profile_id    BIGINT NOT NULL REFERENCES candidate_profile(id),
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS volunteer_item (
  id          BIGSERIAL PRIMARY KEY,
  plan_id     BIGINT NOT NULL REFERENCES volunteer_plan(id),
  candidate_id TEXT NOT NULL,
  position    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor       TEXT,
  action      TEXT NOT NULL,
  entity      TEXT,
  entity_id   TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta        JSONB
);
