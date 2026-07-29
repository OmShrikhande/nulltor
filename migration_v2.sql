-- ============================================================
-- Nulltor — Migration v2
-- Adds: branches, branch_members, merge_requests tables
--       branch_id column to directories, audit_logs
--       composite (file_id, branch_id) PK to file_snapshots
--       new audit_action and resource_type enum values
-- Run: psql -U postgres -d nulltor -f migration_v2.sql
-- ============================================================

-- ── New Enum Values ──────────────────────────────────────────────────────────

-- branch_type
DO $$ BEGIN
    CREATE TYPE branch_type AS ENUM ('main', 'subroom', 'private');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- merge_status
DO $$ BEGIN
    CREATE TYPE merge_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Extend audit_action (idempotent per value)
DO $$ BEGIN
    ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'branch_created';
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'merged';
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'merge_reviewed';
EXCEPTION WHEN others THEN NULL;
END $$;

-- Extend resource_type
DO $$ BEGIN
    ALTER TYPE resource_type ADD VALUE IF NOT EXISTS 'branch';
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TYPE resource_type ADD VALUE IF NOT EXISTS 'merge_request';
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── New Tables ───────────────────────────────────────────────────────────────

-- Branches
CREATE TABLE IF NOT EXISTS branches (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name             VARCHAR(255) NOT NULL,
    type             branch_type  NOT NULL DEFAULT 'subroom',
    parent_branch_id UUID         REFERENCES branches(id) ON DELETE SET NULL,
    created_by       UUID         REFERENCES users(id) ON DELETE SET NULL,
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, name)
);

COMMENT ON TABLE branches IS 'Per-project branches: main (shared room), subroom (collaborative feature branch), private (owner-only fork).';
COMMENT ON COLUMN branches.type IS 'main = visible to all members; subroom = collaborative, invite-controlled; private = owner-only.';

-- Branch Members (for subroom access control)
CREATE TABLE IF NOT EXISTS branch_members (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id   UUID        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (branch_id, user_id)
);

COMMENT ON TABLE branch_members IS 'Controls which users can access a subroom branch. Not used for main (all members) or private (owner only).';

-- Merge Requests
CREATE TABLE IF NOT EXISTS merge_requests (
    id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id               UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_branch_id         UUID         NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    target_branch_id         UUID         NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    file_id                  TEXT         NOT NULL,   -- the directory/file node being merged
    requested_by             UUID         REFERENCES users(id) ON DELETE SET NULL,
    reviewed_by              UUID         REFERENCES users(id) ON DELETE SET NULL,
    status                   merge_status NOT NULL DEFAULT 'pending',
    pre_merge_snapshot       TEXT,        -- encrypted Yjs snapshot of target BEFORE merge (for rollback/review)
    merged_snapshot          TEXT,        -- encrypted Yjs snapshot of the confirmed merged result
    detail                   JSONB        NOT NULL DEFAULT '{}',
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merge_requests IS 'Tracks in-progress and completed Yjs CRDT merges between branches. Pre-merge snapshot stored for review and rollback.';

-- ── Alter Existing Tables ────────────────────────────────────────────────────

-- Add branch_id to directories (nullable — existing rows default to NULL, will be back-filled to main branch)
ALTER TABLE directories
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

-- Drop old unique constraint and replace with branch-scoped one
ALTER TABLE directories
    DROP CONSTRAINT IF EXISTS uq_dir_name_in_parent;

ALTER TABLE directories
    ADD CONSTRAINT uq_dir_name_in_branch
    UNIQUE (project_id, parent_id, branch_id, name);

-- Add branch_id to audit_logs
ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

-- ── file_snapshots table (managed by Node.js) ────────────────────────────────
-- Migrate from single-column PK to composite PK (file_id, branch_id)
-- This table is created by index.js on startup with: CREATE TABLE IF NOT EXISTS file_snapshots (file_id TEXT PRIMARY KEY, ...)
-- We add branch_id and change the PK here.
DO $$
BEGIN
    -- Add branch_id column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'file_snapshots' AND column_name = 'branch_id'
    ) THEN
        ALTER TABLE file_snapshots ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'main';
    END IF;

    -- Drop old single-column PK
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'file_snapshots' AND constraint_type = 'PRIMARY KEY'
    ) THEN
        ALTER TABLE file_snapshots DROP CONSTRAINT IF EXISTS file_snapshots_pkey;
    END IF;

    -- Add new composite PK
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'file_snapshots' AND constraint_type = 'PRIMARY KEY'
    ) THEN
        ALTER TABLE file_snapshots ADD PRIMARY KEY (file_id, branch_id);
    END IF;
END $$;

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_branches_project    ON branches(project_id);
CREATE INDEX IF NOT EXISTS idx_branches_type       ON branches(type);
CREATE INDEX IF NOT EXISTS idx_branches_active     ON branches(is_active);

CREATE INDEX IF NOT EXISTS idx_branch_members_branch ON branch_members(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_members_user   ON branch_members(user_id);

CREATE INDEX IF NOT EXISTS idx_merge_requests_project ON merge_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_merge_requests_status  ON merge_requests(status);
CREATE INDEX IF NOT EXISTS idx_merge_requests_source  ON merge_requests(source_branch_id);
CREATE INDEX IF NOT EXISTS idx_merge_requests_target  ON merge_requests(target_branch_id);

CREATE INDEX IF NOT EXISTS idx_dirs_branch         ON directories(branch_id);
CREATE INDEX IF NOT EXISTS idx_logs_branch         ON audit_logs(branch_id);

-- ── Auto-update handled by SQLAlchemy ORM onupdate ─────────────────────────────

-- ── Seed: create 'main' branch for every existing project ────────────────────

INSERT INTO branches (project_id, name, type, is_active)
SELECT id, 'main', 'main', TRUE
FROM projects
WHERE is_active = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM branches b WHERE b.project_id = projects.id AND b.name = 'main'
  );

-- Back-fill directories.branch_id to the main branch of each project
UPDATE directories d
SET branch_id = (
    SELECT b.id FROM branches b
    WHERE b.project_id = d.project_id AND b.name = 'main'
    LIMIT 1
)
WHERE d.branch_id IS NULL;

-- ============================================================
SELECT 'Migration v2 applied successfully.' AS status;
-- ============================================================
