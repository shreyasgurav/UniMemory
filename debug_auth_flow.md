# Debug: Missing Memories Issue

## Problem Statement
- User saved chat via extension → showed "saved 8 memories"
- Dashboard shows NO memories
- Database tables are EMPTY

## Flow Analysis

### 1. Extension Authentication Flow
```
Extension → Opens /extension/welcome
Welcome page → Gets Firebase user → getIdToken()
Welcome page → postMessage(token) to content script
Content script → Sends token to background.js
Background.js → Calls /consumer/auth/session with Firebase token
API → Verifies Firebase token → get_or_create_user() → Creates/finds User by firebase_uid
API → Returns JWT session token with payload.sub = user.id
Extension → Stores session token locally
```

### 2. Extension Save Flow
```
Extension → Calls /ingest/chat with Authorization: Bearer <session_token>
API → get_ingest_auth() extracts bearer token
API → verify_consumer_session_token() decodes JWT
API → Gets payload.sub (which is user.id)
API → Queries User.id == payload.sub
API → Creates Source with owner_id = str(user.id)
API → Creates Memory records with owner_id = str(user.id)
API → Commits to database
```

### 3. Dashboard Fetch Flow
```
Dashboard → User logs in with Firebase
Dashboard → Calls /consumer/sources with Authorization: Bearer <firebase_token>
API → get_current_user() dependency
API → verify_firebase_token() → gets firebase_data
API → get_or_create_user(firebase_data) → finds User by firebase_uid
API → Returns User object
API → Queries Source WHERE owner_id == str(user.id)
API → Queries Memory WHERE owner_id == str(user.id)
```

## Potential Issues

### Issue #1: Different Firebase Accounts ❌
**Symptom:** Extension authenticated with Account A, Dashboard logged in with Account B
**Result:** Different user.id values → data saved under Account A, fetched under Account B
**Check:** Verify same email/firebase_uid in both flows

### Issue #2: Session Token Has Wrong user.id ❌
**Location:** `/consumer/auth/session` endpoint
**Check:** JWT payload.sub must equal the Firebase user's database user.id
**Code:** Line 675 in consumer.py: `"sub": str(user.id)`

### Issue #3: Database Commit Not Happening ❌
**Location:** `store_extracted_memories()` in ingest.py
**Check:** Line 260 - `await session.commit()` must execute
**Possible cause:** Exception before commit, transaction rollback

### Issue #4: API Not Deployed with Latest Code ❌
**Check:** Railway deployment has commit 3f36d40 with source_metadata fix
**Symptom:** Old code might not be storing data correctly

## Debugging Steps

1. **Check Railway Logs:**
   - Look for `/ingest/chat` POST requests
   - Check if any errors/exceptions during save
   - Verify commit happens

2. **Check Database Directly:**
   ```sql
   SELECT id, firebase_uid, email FROM users;
   SELECT id, owner_id, type, created_at FROM sources;
   SELECT id, owner_id, content, created_at FROM memories LIMIT 10;
   ```

3. **Verify Extension Session:**
   - Open extension background console
   - Check stored session: `chrome.storage.local.get('unimemory_session')`
   - Decode JWT token to see payload.sub

4. **Verify Dashboard User:**
   - Open browser console on dashboard
   - Check Firebase user: `firebase.auth().currentUser`
   - Call API manually to see user.id

5. **Test API Directly:**
   ```bash
   # Get session token
   curl -X GET https://unimemory.up.railway.app/api/v1/consumer/auth/session \
     -H "Authorization: Bearer <FIREBASE_TOKEN>"
   
   # Save chat with session token
   curl -X POST https://unimemory.up.railway.app/api/v1/ingest/chat \
     -H "Authorization: Bearer <SESSION_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"messages":[{"role":"user","content":"test"}]}'
   
   # Fetch sources
   curl -X GET https://unimemory.up.railway.app/api/v1/consumer/sources \
     -H "Authorization: Bearer <FIREBASE_TOKEN>"
   ```

## Most Likely Root Cause

Based on code analysis, the most likely issues are:

1. **Railway API not deployed with latest code** - Still has old ingest.py without source_metadata support
2. **Different Firebase accounts** - Extension and dashboard using different logins
3. **Database transaction rollback** - Exception happening after memory creation but before commit
