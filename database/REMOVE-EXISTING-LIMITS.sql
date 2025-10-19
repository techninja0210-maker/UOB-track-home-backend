-- ============================================
-- REMOVE EXISTING DATABASE LIMITS
-- ============================================
-- Run this BEFORE running FINAL-MIGRATION.sql
-- This removes limits from existing tables

-- Remove VARCHAR limits (convert to TEXT)
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
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE TEXT', r.table_name, r.column_name);
        RAISE NOTICE 'Converted %.% from VARCHAR(%) to TEXT', r.table_name, r.column_name, r.character_maximum_length;
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
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE NUMERIC', r.table_name, r.column_name);
        RAISE NOTICE 'Converted %.% from NUMERIC(%,%) to NUMERIC', r.table_name, r.column_name, r.numeric_precision, r.numeric_scale;
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
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE TEXT', r.table_name, r.column_name);
        RAISE NOTICE 'Converted %.% from CHAR(%) to TEXT', r.table_name, r.column_name, r.character_maximum_length;
    END LOOP;
END $$;

SELECT 'All existing database limits have been removed!' as message;
