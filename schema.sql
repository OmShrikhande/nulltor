-- ============================================================
-- Nulltor — PostgreSQL Schema
-- Run once on any server: psql -U postgres -d nulltor -f schema.sql
-- Or: psql -U postgres -c "CREATE DATABASE nulltor;" && psql -U postgres -d nulltor -f schema.sql
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
    CREATE TYPE audit_action AS ENUM (
        'login', 'logout',
        'create', 'update', 'delete',
        'grant_access', 'revoke_access',
        'create_room', 'join_room', 'leave_room',
        'upload_snapshot', 'load_snapshot',
        'deactivate_user', 'reactivate_user'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE resource_type AS ENUM (
        'user', 'project', 'directory', 'file',
        'membership', 'room', 'session', 'snapshot'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLES
-- ============================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
    id                       UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    email                    VARCHAR(255) NOT NULL UNIQUE,
    username                 VARCHAR(100) NOT NULL UNIQUE,
    hashed_password          VARCHAR(255) NOT NULL,
    requires_password_change BOOLEAN      NOT NULL DEFAULT FALSE,
    role                     user_role    NOT NULL DEFAULT 'member',
    is_active                BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE users IS 'Platform users with global roles (superadmin, admin, member).';
COMMENT ON COLUMN users.role IS 'superadmin = full access; admin = can create projects and manage members; member = assigned projects only.';

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id    UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    room_salt   VARCHAR(255),
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE projects IS 'Top-level projects. Each project has one collaborative room.';
COMMENT ON COLUMN projects.room_salt IS 'AES salt for the Socket.IO room — set when the first room is created.';

-- Memberships (project-level access control / data isolation)
CREATE TABLE IF NOT EXISTS memberships (
    id          UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id  UUID            NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role        membership_role NOT NULL DEFAULT 'member',
    granted_by  UUID            REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, project_id)
);

COMMENT ON TABLE memberships IS 'Maps users to projects with project-level roles. Enforces data isolation.';
COMMENT ON COLUMN memberships.role IS 'lead = project admin (can manage members, create rooms); member = view/edit only.';

-- Directory / File Tree
CREATE TABLE IF NOT EXISTS directories (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id    UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id     UUID        REFERENCES directories(id) ON DELETE CASCADE,
    name          VARCHAR(255) NOT NULL,
    type          node_type   NOT NULL DEFAULT 'file',
    snapshot_path TEXT,                -- relative path to encrypted Yjs snapshot on disk
    created_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
    updated_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, parent_id, name)
);

COMMENT ON TABLE directories IS 'GitHub-style tree of directories and files per project.';
COMMENT ON COLUMN directories.snapshot_path IS 'Path to encrypted Yjs .snap file on disk. Null = no saved content yet.';

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id      UUID          REFERENCES users(id) ON DELETE SET NULL,
    project_id    UUID          REFERENCES projects(id) ON DELETE SET NULL,
    resource_type resource_type NOT NULL,
    resource_id   UUID,
    action        audit_action  NOT NULL,
    detail        JSONB         NOT NULL DEFAULT '{}',
    ip_address    INET,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_logs IS 'Immutable audit trail. Every create/update/delete/access action is recorded here.';

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

CREATE INDEX IF NOT EXISTS idx_directories_proj   ON directories(project_id);
CREATE INDEX IF NOT EXISTS idx_directories_parent ON directories(parent_id);
CREATE INDEX IF NOT EXISTS idx_directories_type   ON directories(type);

CREATE INDEX IF NOT EXISTS idx_logs_actor         ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_logs_project       ON audit_logs(project_id);
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

CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_dirs_updated_at
    BEFORE UPDATE ON directories
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- DONE
-- ============================================================

SELECT 'Schema created successfully.' AS status;
