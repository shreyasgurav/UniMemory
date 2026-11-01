-- MCP Gateway: external app connections (Gmail, Notion, ...)
-- Additive and safe. The app's init_db() create_all also creates this table on
-- the next deploy, so running this manually is optional.

CREATE TABLE IF NOT EXISTS connector_connections (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider          VARCHAR(30) NOT NULL,
    status            VARCHAR(20) DEFAULT 'connected',
    account_label     VARCHAR(255),
    scopes            TEXT,
    access_token_enc  TEXT,
    refresh_token_enc TEXT,
    token_expiry      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_connector_user_provider
    ON connector_connections (user_id, provider);
CREATE INDEX IF NOT EXISTS idx_connector_user
    ON connector_connections (user_id);
