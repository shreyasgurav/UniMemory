-- Migration: Add mcp_activity table for tracking MCP tool calls
-- Created: 2026-01-15

CREATE TABLE IF NOT EXISTS mcp_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mcp_token_id UUID REFERENCES mcp_tokens(id) ON DELETE SET NULL,
    
    -- Tool call details
    tool_name VARCHAR(100) NOT NULL,
    client_type VARCHAR(50),
    
    -- Tool arguments (for context)
    tool_args JSONB DEFAULT '{}',
    
    -- Results summary
    result_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mcp_activity_user_id ON mcp_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_activity_mcp_token_id ON mcp_activity(mcp_token_id);
CREATE INDEX IF NOT EXISTS idx_mcp_activity_user_created ON mcp_activity(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mcp_activity_tool ON mcp_activity(tool_name);
CREATE INDEX IF NOT EXISTS idx_mcp_activity_created_at ON mcp_activity(created_at);
