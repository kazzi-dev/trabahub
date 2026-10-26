-- Daily follow-up digest: users can opt out, and we remember when each one was last sent.
ALTER TABLE users ADD COLUMN email_digest boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN last_digest_at timestamptz;
CREATE INDEX jobs_follow_up_idx ON jobs (follow_up_at) WHERE status = 'applied';
