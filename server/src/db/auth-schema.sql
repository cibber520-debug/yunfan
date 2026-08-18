-- ===================================================================
-- 用户认证与档案持久化（增量迁移，可对已存在的业务表安全执行）
-- ===================================================================

CREATE TABLE IF NOT EXISTS app_user (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT,
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- 兼容旧库：email 改为可空（允许仅用手机号注册）
ALTER TABLE app_user ALTER COLUMN email DROP NOT NULL;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS phone TEXT;

-- 邮箱或手机号至少填其一，且各自唯一（手机通道接入）
DROP INDEX IF EXISTS uq_app_user_email_lower;
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_user_email_lower ON app_user (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_user_phone ON app_user (phone) WHERE phone IS NOT NULL;
ALTER TABLE app_user
  DROP CONSTRAINT IF EXISTS chk_app_user_contact;
ALTER TABLE app_user
  ADD CONSTRAINT chk_app_user_contact CHECK (email IS NOT NULL OR phone IS NOT NULL);

CREATE TABLE IF NOT EXISTS email_verification_code (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT,
  phone      TEXT,
  purpose    TEXT NOT NULL CHECK (purpose IN ('REGISTER', 'LOGIN')),
  code_hash  TEXT NOT NULL,
  attempt_count SMALLINT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  request_ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 兼容旧库：email 改为可空（手机通道只用 phone 列）
ALTER TABLE email_verification_code ALTER COLUMN email DROP NOT NULL;
ALTER TABLE email_verification_code
  ADD COLUMN IF NOT EXISTS attempt_count SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE email_verification_code
  ADD COLUMN IF NOT EXISTS phone TEXT;
CREATE INDEX IF NOT EXISTS idx_verification_code_lookup
  ON email_verification_code (email, purpose, created_at DESC)
  WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_verification_code_phone_lookup
  ON email_verification_code (phone, purpose, created_at DESC)
  WHERE consumed_at IS NULL;
-- 每条验证码必须且只能绑定邮箱或手机号之一
ALTER TABLE email_verification_code
  DROP CONSTRAINT IF EXISTS chk_verification_contact;
ALTER TABLE email_verification_code
  ADD CONSTRAINT chk_verification_contact CHECK (
    (email IS NOT NULL AND phone IS NULL) OR (email IS NULL AND phone IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS auth_session (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_auth_session_active
  ON auth_session (user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS user_profile (
  user_id               BIGINT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  draft                 JSONB NOT NULL,
  completed_step        SMALLINT NOT NULL DEFAULT 0 CHECK (completed_step BETWEEN 0 AND 6),
  selected_volunteer_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
