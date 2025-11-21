-- ============================================================================
-- GRANT PERMISSIONS FOR NEON DATABASE
-- Run this in your Neon SQL Editor (should work as any user)
-- ============================================================================

-- Grant CREATE permission on public schema (Neon-compatible)
GRANT CREATE ON SCHEMA public TO public;
GRANT ALL ON SCHEMA public TO public;

-- Grant default privileges for tables and sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO public;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO public;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Verify permissions (optional - just to check)
SELECT 
    current_user as current_role,
    has_schema_privilege('public', current_user, 'CREATE') as can_create_in_public,
    has_database_privilege(current_database(), current_user, 'CREATE') as can_create_db;

