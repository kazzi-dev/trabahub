-- Invite links for organizations. Codes are stored hashed and expire.
CREATE TABLE invites (
  code_hash text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'coach', 'member')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invites_org_idx ON invites (organization_id);
CREATE INDEX memberships_user_idx ON memberships (user_id);
