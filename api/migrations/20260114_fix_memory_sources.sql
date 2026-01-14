-- Fix memory_sources table schema issues
-- Run this in Supabase SQL Editor

-- 1. Check current schema
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'memory_sources'
ORDER BY ordinal_position;

-- 2. Drop source_id_legacy column if it exists (causing NOT NULL errors)
ALTER TABLE memory_sources 
  DROP COLUMN IF EXISTS source_id_legacy CASCADE;

-- 3. Ensure source_id is nullable temporarily to allow existing data
ALTER TABLE memory_sources 
  ALTER COLUMN source_id DROP NOT NULL;

-- 4. Clean up any orphaned records
DELETE FROM memory_sources 
WHERE source_id IS NULL OR memory_id IS NULL;

-- 5. Re-add NOT NULL constraint
ALTER TABLE memory_sources 
  ALTER COLUMN source_id SET NOT NULL;

-- 6. Verify final schema
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'memory_sources'
ORDER BY ordinal_position;
