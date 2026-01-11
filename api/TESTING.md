# Testing Guide for UniMemory API

This guide covers how to test the production-ready API before and after deployment.

## Pre-Deployment Testing

### 1. Local Testing (Recommended First)

Test locally before deploying to catch issues early.

```bash
# 1. Install dependencies
cd api
pip install -r requirements.txt

# 2. Set environment variables
export DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/unimemory"
export OPENAI_API_KEY="sk-..."
export ENVIRONMENT=development
export REDIS_URL="redis://localhost:6379/0"  # Optional

# 3. Run the API
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 4. In another terminal, run tests
export UNIMEMORY_API_KEY="your-test-api-key"  # Get from dashboard
python3 test_production_api.py --url http://localhost:8000
```

### 2. Check for Syntax/Import Errors

```bash
# Check for linting errors
python3 -m py_compile app/main.py app/api/*.py app/core/*.py

# Try importing main module
python3 -c "from app.main import app; print('✅ Imports OK')"
```

## Post-Deployment Testing

### 1. Get Your API Key

1. Go to your dashboard: https://unimemory.vercel.app (or your domain)
2. Navigate to API Keys
3. Create a new API key or use existing one
4. Copy the key (shown only once!)

### 2. Run Production Test Script

```bash
# Set your API key
export UNIMEMORY_API_KEY="um_live_your-actual-key-here"

# Run tests against production
python3 test_production_api.py

# Or test against staging/other environment
python3 test_production_api.py --url https://your-staging-url.com
```

### 3. Manual Testing with cURL

#### Health Check
```bash
curl https://unimemory.up.railway.app/api/v1/health
```

#### Validate API Key
```bash
curl -H "X-API-Key: um_live_your-key" \
  https://unimemory.up.railway.app/api/v1/auth/validate
```

#### Add Memory
```bash
curl -X POST https://unimemory.up.railway.app/api/v1/memories/add \
  -H "X-API-Key: um_live_your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "I prefer dark mode for applications",
    "user_id": "test_user",
    "source_app": "test"
  }'
```

#### Search Memories
```bash
curl -X POST https://unimemory.up.railway.app/api/v1/search \
  -H "X-API-Key: um_live_your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "dark mode",
    "limit": 5,
    "user_id": "test_user"
  }'
```

#### List Memories
```bash
curl -H "X-API-Key: um_live_your-key" \
  "https://unimemory.up.railway.app/api/v1/memories?user_id=test_user&limit=10"
```

## Test Checklist

### ✅ Basic Functionality
- [ ] Health endpoint returns 200
- [ ] Readiness check passes (database connected)
- [ ] API key validation works
- [ ] Invalid API key returns 401
- [ ] Missing API key returns 401

### ✅ Memory Operations
- [ ] Add memory succeeds
- [ ] Memory extraction works (check extracted_count > 0)
- [ ] Search returns relevant results
- [ ] List memories returns correct count
- [ ] Get single memory works
- [ ] Update memory works (salience, tags, metadata)
- [ ] Multi-tenancy works (can't see other users' memories)

### ✅ Performance
- [ ] API key validation is fast (<100ms with cache)
- [ ] Search completes in reasonable time (<2s)
- [ ] Rate limiting headers are present
- [ ] Request IDs are returned in headers

### ✅ Security
- [ ] Security headers are present (X-Content-Type-Options, etc.)
- [ ] CORS is configured correctly
- [ ] Rate limiting prevents abuse
- [ ] Input validation works (max length, required fields)

### ✅ Production Readiness
- [ ] Logs are structured and readable
- [ ] Error messages don't leak sensitive info
- [ ] Database connection pooling works
- [ ] Background tasks complete (waypoint creation)

## Common Issues & Solutions

### Issue: "Invalid API key"
**Solution**: 
- Check API key is copied correctly (no extra spaces)
- Verify API key is active in dashboard
- Check API key hasn't expired

### Issue: "Timeout on add memory"
**Solution**:
- OpenAI API might be slow - this is normal
- Check OPENAI_API_KEY is set correctly
- Verify OpenAI account has credits

### Issue: "Database connection failed"
**Solution**:
- Check DATABASE_URL is correct
- Verify database is accessible from Railway
- Check connection pool settings

### Issue: "Rate limit exceeded"
**Solution**:
- This is working as intended!
- Wait for the reset time (check X-RateLimit-Reset header)
- Or adjust RATE_LIMIT_REQUESTS in config

### Issue: "Redis connection failed"
**Solution**:
- Redis is optional - API falls back to in-memory cache
- If you need Redis, add REDIS_URL to Railway environment variables
- Without Redis: rate limiting is disabled, caching is in-memory only

## Performance Benchmarks

Expected performance (with Redis):

| Operation | Expected Time | Notes |
|-----------|---------------|-------|
| Health check | <50ms | No auth required |
| API key validation (cached) | <10ms | With Redis cache |
| API key validation (uncached) | <100ms | Prefix lookup |
| Add memory | 2-5s | Includes OpenAI calls |
| Search memories | 500ms-2s | Depends on database size |
| List memories | <200ms | Simple query |
| Update memory | <100ms | Simple update |

## Monitoring in Production

### Railway Logs
```bash
# View logs in Railway dashboard
# Or use Railway CLI
railway logs
```

### Key Metrics to Monitor
- Response times (should be <2s for most requests)
- Error rates (should be <1%)
- Database connection pool usage
- Rate limit hits
- OpenAI API latency

### Health Check Endpoints
- `/api/v1/health` - Simple check (for load balancers)
- `/api/v1/health/ready` - Readiness (checks DB)
- `/api/v1/health/live` - Liveness (always returns)
- `/api/v1/health/detailed` - Full status (pool info, config)

## Next Steps After Testing

1. ✅ All tests pass → Ready for production!
2. ⚠️ Some failures → Check logs, fix issues, re-test
3. 🔴 Critical failures → Review changes, check deployment

## Continuous Testing

For CI/CD, add to your workflow:

```yaml
# Example GitHub Actions
- name: Test Production API
  env:
    UNIMEMORY_API_KEY: ${{ secrets.UNIMEMORY_API_KEY }}
  run: |
    python3 api/test_production_api.py --url ${{ secrets.API_URL }}
```
