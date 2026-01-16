-- Migration: Add activity_logs table for comprehensive activity tracking
-- Date: 2026-01-16

-- Create activity_logs table
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Activity type: memory_created, memory_deleted, memory_searched, source_created, etc.
    action VARCHAR(100) NOT NULL,
    
    -- Source of action: extension, mcp, dashboard, api
    source VARCHAR(50) NOT NULL,
    
    -- Optional agent/client info: cursor, claude, chatgpt, chrome, etc.
    agent VARCHAR(100),
    
    -- Related entity IDs (nullable)
    memory_id UUID,
    source_id UUID,
    
    -- Activity details as JSON
    details JSONB DEFAULT '{}',
    
    -- Human-readable description
    description TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created ON activity_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_source ON activity_logs(source);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);

-- Add comment
COMMENT ON TABLE activity_logs IS 'Comprehensive activity log for all user actions - extension, MCP, dashboard, API';
