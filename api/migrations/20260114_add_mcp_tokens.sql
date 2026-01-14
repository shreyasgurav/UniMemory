-- Migration: Add mcp_tokens table for consumer MCP authentication
-- Run this on your database

CREATE TABLE IF NOT EXISTS mcp_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Token identification
    name VARCHAR(100) NOT NULL,
    client_type VARCHAR(50) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    token_prefix VARCHAR(20),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Usage tracking
    last_used_at TIMESTAMP WITH TIME ZONE,
    usage_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user_id ON mcp_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user_client ON mcp_tokens(user_id, client_type);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_prefix ON mcp_tokens(token_prefix);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_active ON mcp_tokens(is_active);

-- Verify
SELECT 'mcp_tokens table created successfully' AS status;
