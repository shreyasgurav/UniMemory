-- Migration: add api_key_id to memories (for B2B attribution)
-- Safe to run multiple times

ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS api_key_id uuid NULL;

-- Add FK constraint if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_memories_api_key_id'
  ) THEN
    ALTER TABLE memories
      ADD CONSTRAINT fk_memories_api_key_id
      FOREIGN KEY (api_key_id)
      REFERENCES api_keys (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memories_api_key_id ON memories (api_key_id);
CREATE INDEX IF NOT EXISTS idx_memories_owner_api_key_active ON memories (owner_id, api_key_id, is_active);
