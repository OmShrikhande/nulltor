-- ============================================================
-- Nulltor — Unified PostgreSQL Production Schema
-- Run once on any server: psql -U postgres -d nulltor -f schema.sql
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE membership_role AS ENUM ('lead', 'member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE node_type AS ENUM ('dir', 'file');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE branch_type AS ENUM ('main', 'subroom', 'private');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE merge_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE audit_action AS ENUM (
        'login', 'logout',
        'create', 'update', 'delete',
        'grant_access', 'revoke_access',
        'create_room', 'join_room', 'leave_room',
        'upload_snapshot', 'load_snapshot',
        'deactivate_user', 'reactivate_user',
        'branch_created', 'merged', 'merge_reviewed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE resource_type AS ENUM (
        'user', 'project', 'directory', 'file',
        'membership', 'room', 'session', 'snapshot',
        'branch', 'merge_request'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLES
-- ============================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    username        VARCHAR(100) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    role            user_role    NOT NULL DEFAULT 'member',
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id    UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    room_salt   VARCHAR(255),
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Memberships (project-level access control / data isolation)
CREATE TABLE IF NOT EXISTS memberships (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id  UUID            NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role        membership_role NOT NULL DEFAULT 'member',
    granted_by  UUID            REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, project_id)
);

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

-- Branch Members (for subroom access control)
CREATE TABLE IF NOT EXISTS branch_members (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id   UUID        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (branch_id, user_id)
);

-- Directory / File Tree
CREATE TABLE IF NOT EXISTS directories (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id     UUID         REFERENCES directories(id) ON DELETE CASCADE,
    branch_id     UUID         REFERENCES branches(id) ON DELETE CASCADE,
    name          VARCHAR(255) NOT NULL,
    type          node_type    NOT NULL DEFAULT 'file',
    snapshot_path TEXT,
    created_by    UUID         REFERENCES users(id) ON DELETE SET NULL,
    updated_by    UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, parent_id, branch_id, name)
);

-- Commits
CREATE TABLE IF NOT EXISTS commits (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    branch_id   UUID         NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    file_id     VARCHAR(255) NOT NULL,
    user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
    message     VARCHAR(255) NOT NULL,
    snapshot    TEXT         NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Merge Requests
CREATE TABLE IF NOT EXISTS merge_requests (
    id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id               UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_branch_id         UUID         NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    target_branch_id         UUID         NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    file_id                  TEXT         NOT NULL,
    requested_by             UUID         REFERENCES users(id) ON DELETE SET NULL,
    reviewed_by              UUID         REFERENCES users(id) ON DELETE SET NULL,
    status                   merge_status NOT NULL DEFAULT 'pending',
    pre_merge_snapshot       TEXT,
    merged_snapshot          TEXT,
    detail                   JSONB        NOT NULL DEFAULT '{}',
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id      UUID          REFERENCES users(id) ON DELETE SET NULL,
    project_id    UUID          REFERENCES projects(id) ON DELETE SET NULL,
    branch_id     UUID          REFERENCES branches(id) ON DELETE SET NULL,
    resource_type resource_type NOT NULL,
    resource_id   UUID,
    action        audit_action  NOT NULL,
    detail        JSONB         NOT NULL DEFAULT '{}',
    ip_address    INET,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- File Snapshots (Managed by Node.js real-time gateway)
CREATE TABLE IF NOT EXISTS file_snapshots (
    file_id    TEXT        NOT NULL,
    branch_id  TEXT        NOT NULL DEFAULT 'main',
    data       TEXT        NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (file_id, branch_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_email        ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role         ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active       ON users(is_active);

CREATE INDEX IF NOT EXISTS idx_projects_owner     ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_active    ON projects(is_active);

CREATE INDEX IF NOT EXISTS idx_memberships_user   ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_proj   ON memberships(project_id);

CREATE INDEX IF NOT EXISTS idx_branches_project   ON branches(project_id);
CREATE INDEX IF NOT EXISTS idx_branches_type      ON branches(type);
CREATE INDEX IF NOT EXISTS idx_branches_active    ON branches(is_active);

CREATE INDEX IF NOT EXISTS idx_branch_members_b   ON branch_members(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_members_u   ON branch_members(user_id);

CREATE INDEX IF NOT EXISTS idx_directories_proj   ON directories(project_id);
CREATE INDEX IF NOT EXISTS idx_directories_parent ON directories(parent_id);
CREATE INDEX IF NOT EXISTS idx_directories_branch ON directories(branch_id);
CREATE INDEX IF NOT EXISTS idx_directories_type   ON directories(type);

CREATE INDEX IF NOT EXISTS idx_commits_project    ON commits(project_id);
CREATE INDEX IF NOT EXISTS idx_commits_branch     ON commits(branch_id);
CREATE INDEX IF NOT EXISTS idx_commits_file       ON commits(file_id);

CREATE INDEX IF NOT EXISTS idx_merge_requests_p   ON merge_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_merge_requests_s   ON merge_requests(status);
CREATE INDEX IF NOT EXISTS idx_merge_requests_src ON merge_requests(source_branch_id);
CREATE INDEX IF NOT EXISTS idx_merge_requests_tgt ON merge_requests(target_branch_id);

CREATE INDEX IF NOT EXISTS idx_logs_actor         ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_logs_project       ON audit_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_logs_branch        ON audit_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_logs_action        ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_logs_resource      ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_logs_created       ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_detail        ON audit_logs USING GIN (detail);

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_users_updated_at    ON users;
DROP TRIGGER IF EXISTS set_projects_updated_at ON projects;
DROP TRIGGER IF EXISTS set_dirs_updated_at     ON directories;
DROP TRIGGER IF EXISTS set_branches_updated_at ON branches;
DROP TRIGGER IF EXISTS set_merges_updated_at   ON merge_requests;

CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_dirs_updated_at
    BEFORE UPDATE ON directories
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_branches_updated_at
    BEFORE UPDATE ON branches
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_merges_updated_at
    BEFORE UPDATE ON merge_requests
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
