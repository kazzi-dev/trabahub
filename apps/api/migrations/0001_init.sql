-- Initial schema. Mirrors src/db/schema.ts; migrations run in filename order at startup.
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text,
  image text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  provider text NOT NULL,
  provider_account_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_account_id)
);

CREATE TABLE auth_codes (
  code_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'coach', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  company text NOT NULL,
  location text,
  salary_text text,
  url text,
  source text,
  status text NOT NULL CHECK (status IN ('saved', 'applied', 'interview', 'offer', 'rejected')),
  position integer NOT NULL DEFAULT 0,
  notes text,
  requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  applied_at timestamptz,
  follow_up_at timestamptz,
  deadline timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_user_status_position_idx ON jobs (user_id, status, position);

CREATE TABLE job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('created', 'status_changed', 'updated')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_events_job_idx ON job_events (job_id, at);

CREATE TABLE api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  label text NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX api_tokens_hash_idx ON api_tokens (token_hash);
