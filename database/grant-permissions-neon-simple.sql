-- ============================================================================
-- GRANT PERMISSIONS FOR NEON DATABASE (SIMPLE VERSION)
-- Run this in your Neon SQL Editor
-- ============================================================================

-- Grant CREATE permission on public schema (Neon-compatible)
GRANT CREATE ON SCHEMA public TO public;
GRANT ALL ON SCHEMA public TO public;

-- Grant default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO public;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO public;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Verify (optional)
SELECT current_user as role, version() as pg_version;

