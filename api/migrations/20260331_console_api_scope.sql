-- Migration: Add api_key_id to sources and processing_logs
-- Purpose: Separate developer API data from consumer data in the console dashboard
-- The console should ONLY show data created via API keys (api_key_id IS NOT NULL)
-- Consumer/MCP/extension data has api_key_id = NULL and stays in consumer app only

-- 1. Add api_key_id to sources (tracks which API key created the source)
ALTER TABLE sources ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sources_api_key ON sources(api_key_id);

-- 2. Add owner_id and api_key_id to processing_logs (was completely unscoped before)
ALTER TABLE processing_logs ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE processing_logs ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_processing_logs_owner ON processing_logs(owner_id);
CREATE INDEX IF NOT EXISTS idx_processing_logs_api_key ON processing_logs(api_key_id);

-- Note: Existing rows will have NULL for new columns.
-- This is correct - old data cannot be retroactively attributed to API keys.
-- Going forward, all new ingest calls will populate these columns.
