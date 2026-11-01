# MCP Gateway — setup (Gmail first)

UniMemory stores a user's OAuth token for an external app (Gmail) and exposes
gateway tools over its MCP server so any connected AI agent can search/read that
app. The feature is **inert until these env vars are set** (tools are hidden,
endpoints return 503).

## 1. Env vars (set on Railway, and locally if testing)

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
CONNECTOR_ENC_KEY=...            # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
CONNECTOR_REDIRECT_BASE=https://unimemory.up.railway.app   # this API's public URL
CONSUMER_APP_URL=https://app.unimemory.app                 # where to send the user back
```

Keep these out of git and out of chat.

## 2. Google Cloud OAuth client (one-time)

1. Create / pick a project at console.cloud.google.com.
2. **Enable the Gmail API** (APIs & Services → Library → Gmail API).
3. **OAuth consent screen**: External, add yourself (and demo accounts) as **Test
   users**. Scope: `https://www.googleapis.com/auth/gmail.readonly`.
4. **Credentials → Create OAuth client ID → Web application**. Authorized
   redirect URI:
   ```
   https://unimemory.up.railway.app/api/v1/connectors/gmail/callback
   ```
   (and `http://localhost:8000/api/v1/connectors/gmail/callback` if testing local).
5. Copy the client ID/secret into the env vars above.

Notes: in "testing" mode refresh tokens expire in ~7 days — reconnect before a
demo. No Google verification is needed for test users.

## 3. Database

The `connector_connections` table is created automatically on the next deploy
(`init_db` create_all). To create it manually, run
`api/migrations/20261101_connector_connections.sql`.

## 4. Deploy & test

1. Deploy the API to Railway with the env vars set.
2. In the consumer app → **Connectors → MCP Gateway**, click **Connect** on Gmail
   and complete Google sign-in.
3. In an MCP client (e.g. Cursor) already linked to UniMemory, the new tools
   appear: `list_connectors`, `connector_search`, `connector_fetch`.
4. Prompt: *"Using UniMemory, search my Gmail for emails about <project> and
   summarize."* The agent calls `connector_search(app:"gmail", query:...)` then
   `connector_fetch`.

## Security

- Tokens are encrypted at rest (Fernet, `CONNECTOR_ENC_KEY`) and never logged.
- Read-only Gmail scope; no send/modify.
- Disconnect deletes the stored tokens.
- Fetched email is returned with an "untrusted content" note to reduce indirect
  prompt-injection risk; still review agent actions.

## Notion (next)

Add `NOTION_CLIENT_ID`/`NOTION_CLIENT_SECRET`, a `notion_client.py` mirroring
`gmail_client.py` (search = `POST /v1/search`, fetch = page + block children),
wire `notion` branches in `connector_service` and `mcp.py`, and flip the Notion
card to available. Model/UI/endpoints already handle a generic `provider`.
