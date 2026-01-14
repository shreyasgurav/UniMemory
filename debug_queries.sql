-- Debug queries to check database state

-- 1. Check all users
SELECT id, firebase_uid, email, display_name, created_at 
FROM users 
ORDER BY created_at DESC;

-- 2. Check sources (should have data if save worked)
SELECT id, owner_id, type, source_app, title, created_at 
FROM sources 
ORDER BY created_at DESC 
LIMIT 20;

-- 3. Check memories (should have data if save worked)
SELECT id, owner_id, content, sector, created_at 
FROM memories 
ORDER BY created_at DESC 
LIMIT 20;

-- 4. Check memory-source links
SELECT ms.id, ms.memory_id, ms.source_id, s.type, m.content
FROM memory_sources ms
JOIN sources s ON s.id = ms.source_id
JOIN memories m ON m.id = ms.memory_id
ORDER BY ms.created_at DESC
LIMIT 20;

-- 5. Check end_users table
SELECT id, owner_id, external_user_id, created_at
FROM end_users
ORDER BY created_at DESC
LIMIT 20;

-- 6. Find sources by specific user (replace with your user.id)
-- SELECT id, type, source_app, created_at 
-- FROM sources 
-- WHERE owner_id = 'YOUR_USER_ID_HERE';
