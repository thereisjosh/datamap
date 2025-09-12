# Railway Deployment Configuration

This document outlines the required environment variables and configuration for deploying ERDBuilder on Railway.

## Critical Environment Variables

Based on the Railway deployment logs showing AI chat failures, these variables are essential:

### LLM Service Configuration
```bash
# LLM Provider (required)
LLM_PROVIDER=anthropic

# Modern Claude Model (required - deprecated models cause health failures)
LLM_MODEL=claude-3-5-sonnet-20241022

# API Key (required)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional LLM Settings
LLM_MAX_TOKENS=4000
LLM_TEMPERATURE=0.1
LLM_TIMEOUT=30000
```

### Production Logging Configuration
```bash
# Environment (required for log filtering)
NODE_ENV=production

# Log Level (optional - reduces Railway log spam)
LOG_LEVEL=warn
```

### Optional Features
```bash
# Enable/disable LLM features
ENABLE_LLM_FEATURES=true

# Database configuration (if using external DB)
DATABASE_URL=your_database_url_here
```

## Railway-Specific Notes

### Log Rate Limits
- Railway limits logs to 500 messages/second
- Production environment filtering reduces verbose debug logs
- Reserved word conflicts now log only once per session

### Health Checks
- `/api/erd/health` endpoint provides comprehensive LLM service status
- Returns HTTP 200 for "degraded" status (API rate limits) to reduce false alerts
- Returns HTTP 503 only for "unhealthy" status (invalid API keys, network failures)

### Model Updates
The following Claude models are supported:
- ✅ `claude-3-5-sonnet-20241022` (recommended)
- ✅ `claude-3-5-haiku-20241022` (faster, lower cost)
- ❌ `claude-3-sonnet-20240229` (deprecated - causes health failures)

## Deployment Checklist

1. ✅ Set `LLM_PROVIDER=anthropic`
2. ✅ Set `LLM_MODEL=claude-3-5-sonnet-20241022`
3. ✅ Configure valid `ANTHROPIC_API_KEY`
4. ✅ Set `NODE_ENV=production`
5. ✅ Optional: Set `LOG_LEVEL=warn` to reduce log volume
6. ✅ Test health endpoint: `GET /api/erd/health`

## Troubleshooting

### AI Chat "unhealthy" Status
- Check `ANTHROPIC_API_KEY` is valid and has quota
- Verify `LLM_MODEL` is not deprecated
- Ensure `LLM_PROVIDER=anthropic` matches API key type

### Excessive Logging
- Set `NODE_ENV=production` to enable log filtering
- Set `LOG_LEVEL=warn` or `LOG_LEVEL=error` for minimal logging
- Check health endpoint shows reasonable log volume

### Performance Issues
- Modern models (`claude-3-5-sonnet-20241022`) have better performance
- Consider `claude-3-5-haiku-20241022` for faster response times
- Monitor usage with `/api/erd/health` endpoint statistics