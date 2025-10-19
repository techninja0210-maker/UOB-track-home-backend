-- ============================================
-- SAFELY REMOVE EXISTING DATABASE LIMITS
-- ============================================
-- This script handles views and rules that depend on columns
-- Run this BEFORE running FINAL-MIGRATION.sql

-- First, let's see what views and rules exist
DO $$ 
DECLARE
    r RECORD;
BEGIN
    RAISE NOTICE 'Checking for views and rules that might block column alterations...';
    
    -- List all views
    FOR r IN 
        SELECT schemaname, viewname 
        FROM pg_views 
        WHERE schemaname = 'public'
    LOOP
        RAISE NOTICE 'Found view: %.%', r.schemaname, r.viewname;
    END LOOP;
    
    -- List all rules
    FOR r IN 
        SELECT schemaname, tablename, rulename 
        FROM pg_rules 
        WHERE schemaname = 'public'
    LOOP
        RAISE NOTICE 'Found rule: %.%.%', r.schemaname, r.tablename, r.rulename;
    END LOOP;
END $$;

-- Drop all views first (we'll recreate them later if needed)
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT schemaname, viewname 
        FROM pg_views 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.schemaname, r.viewname);
        RAISE NOTICE 'Dropped view: %.%', r.schemaname, r.viewname;
    END LOOP;
END $$;

-- Now remove VARCHAR limits (convert to TEXT)
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT table_name, column_name, character_maximum_length
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND data_type = 'character varying'
        AND character_maximum_length IS NOT NULL
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE TEXT', r.table_name, r.column_name);
            RAISE NOTICE 'Converted %.% from VARCHAR(%) to TEXT', r.table_name, r.column_name, r.character_maximum_length;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not convert %.%: %', r.table_name, r.column_name, SQLERRM;
        END;
    END LOOP;
END $$;

-- Remove NUMERIC precision limits (convert to unlimited NUMERIC)
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT table_name, column_name, numeric_precision, numeric_scale
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND data_type = 'numeric'
        AND (numeric_precision IS NOT NULL OR numeric_scale IS NOT NULL)
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE NUMERIC', r.table_name, r.column_name);
            RAISE NOTICE 'Converted %.% from NUMERIC(%,%) to NUMERIC', r.table_name, r.column_name, r.numeric_precision, r.numeric_scale;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not convert %.%: %', r.table_name, r.column_name, SQLERRM;
        END;
    END LOOP;
END $$;

-- Remove CHAR limits (convert to TEXT)
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT table_name, column_name, character_maximum_length
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND data_type = 'character'
        AND character_maximum_length IS NOT NULL
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE TEXT', r.table_name, r.column_name);
            RAISE NOTICE 'Converted %.% from CHAR(%) to TEXT', r.table_name, r.column_name, r.character_maximum_length;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not convert %.%: %', r.table_name, r.column_name, SQLERRM;
        END;
    END LOOP;
END $$;

-- Show final status
DO $$ 
DECLARE
    r RECORD;
    limit_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Checking for remaining limits...';
    
    FOR r IN 
        SELECT table_name, column_name, data_type, character_maximum_length, numeric_precision, numeric_scale
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND (character_maximum_length IS NOT NULL 
             OR numeric_precision IS NOT NULL 
             OR numeric_scale IS NOT NULL)
    LOOP
        limit_count := limit_count + 1;
        RAISE NOTICE 'Remaining limit: %.% - % (%,%,%)', r.table_name, r.column_name, r.data_type, r.character_maximum_length, r.numeric_precision, r.numeric_scale;
    END LOOP;
    
    IF limit_count = 0 THEN
        RAISE NOTICE '✅ All limits successfully removed!';
    ELSE
        RAISE NOTICE '⚠️ % limits still remain (may be system columns)', limit_count;
    END IF;
END $$;

SELECT 'Database limit removal completed! Check the notices above for details.' as message;
