# OpenMemory Guide (openmemory.md)

## Overview

 UniMemory includes a browser extension that authenticates using a consumer session JWT (not Firebase directly). Some backend endpoints exist in both Firebase-auth and session-token variants.

## Architecture

 - Extension obtains Firebase ID token via web welcome page and exchanges it for a consumer session token via `GET /consumer/auth/session`.
 - Extension uses the consumer session token for subsequent API calls.

## Components

 - `api/app/api/consumer.py`
   - Session-token auth dependency: `verify_consumer_session_token`
   - Session token decode helper: `verify_consumer_session_token_payload`
   - Extension-focused endpoints:
     - `GET /consumer/session/sources`
     - `GET /consumer/session/sources/{source_id}`
 - `api/app/api/ingest.py`
   - Imports `verify_consumer_session_token_payload` to validate consumer session token when `Authorization: Bearer ...` is present.
 - `extensions/browser/src/background/index.js`
   - Uses consumer session token stored in extension storage.
   - Calls session-based sources endpoints for Cmd+] popup.
 - `extensions/browser/src/content/universal.js`
   - Cmd+] popup UI; triggers login on "Not authenticated".

## Patterns

 - For extension features that require authentication, prefer adding `/consumer/session/...` endpoints authenticated with `verify_consumer_session_token` (consumer session JWT) instead of `get_current_user` (Firebase ID token).

## User Defined Namespaces
- 
