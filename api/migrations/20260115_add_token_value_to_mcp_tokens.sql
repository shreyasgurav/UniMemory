-- Migration: Add token_value column to mcp_tokens table
-- This allows storing the actual token for user retrieval
-- Run this on Railway: psql $DATABASE_URL -f migrations/20260115_add_token_value_to_mcp_tokens.sql

-- Add token_value column if it doesn't exist
ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS token_value VARCHAR(255);

-- Generate new tokens for existing users who don't have token_value set
-- Note: This will be handled by the application on next login
