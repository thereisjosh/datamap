# API Key Management Guide

This guide covers the proper setup and management of API keys for the ERD Builder's LLM features.

## Overview

ERD Builder uses Large Language Models (LLMs) to provide intelligent database schema analysis, SQL generation, and relationship explanation features. The application supports both OpenAI and Anthropic APIs.

## Service Account vs Personal API Keys

### **Recommended: Service Account API Keys**

For production applications, **always use service account API keys**:

✅ **Benefits:**
- Not tied to individual users
- Persist even when team members leave
- Better organizational control
- Enhanced audit trails
- Configurable permissions

❌ **Personal API Keys:**
- Tied to individual accounts
- Become invalid if user leaves organization
- Less suitable for production environments

## Setup Instructions

### 1. Choose Your LLM Provider

**OpenAI (Recommended)**
- More mature API ecosystem
- Extensive model options (GPT-4, GPT-3.5-turbo)
- Good documentation and tooling

**Anthropic**
- Claude models with strong reasoning capabilities
- Good for complex database analysis tasks
- Excellent safety features

### 2. Create Service Account API Key

#### For OpenAI:
1. Go to [OpenAI Platform](https://platform.openai.com)
2. Navigate to **API Keys** section
3. Click **"Create new secret key"**
4. Select **"Service Account"** type
5. Set appropriate permissions (read/write for your project)
6. Copy the API key immediately (it won't be shown again)

#### For Anthropic:
1. Go to [Anthropic Console](https://console.anthropic.com)
2. Navigate to **API Keys**
3. Click **"Create Key"**
4. Name it appropriately (e.g., "ERD Builder Production")
5. Copy the API key immediately

### 3. Configure Environment Variables

Create a `.env` file in your project root:

```bash
# LLM Configuration
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-service-account-api-key-here
LLM_MODEL=gpt-4-turbo-preview

# Optional: Advanced Configuration
LLM_MAX_TOKENS=4000
LLM_TEMPERATURE=0.1
LLM_TIMEOUT=30000
```

**For Anthropic:**
```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your-anthropic-api-key-here
LLM_MODEL=claude-3-haiku-20240307
```

### 4. Verify Configuration

After setting up your API key, verify it works:

```bash
# Start the application
npm run dev

# Test the health endpoint
curl http://localhost:3000/api/erd/health
```

Look for:
- `"apiKeyValid": true`
- `"status": "healthy"`
- No error messages in the response

## Security Best Practices

### 🔒 API Key Protection

1. **Never commit API keys to version control**
   ```bash
   # .gitignore should include:
   .env
   .env.local
   .env.production
   ```

2. **Use environment variables only**
   - Store in `.env` files locally
   - Use secure environment variable injection in production
   - Never hard-code keys in source code

3. **Implement key rotation**
   - Rotate API keys every 90 days
   - Have a backup key ready for zero-downtime rotation
   - Document rotation dates

### 🛡️ Access Controls

1. **Limit API key permissions**
   - Use project-scoped keys when possible
   - Avoid organization-wide permissions
   - Regularly audit key permissions

2. **Monitor usage**
   - Set up budget alerts in provider dashboard
   - Monitor unusual usage patterns
   - Track error rates and response times

3. **IP allowlisting** (if supported)
   - Restrict API key usage to known IP addresses
   - Update allowlist when infrastructure changes

## Monitoring and Alerts

### Dashboard Monitoring

Monitor your API usage through:

1. **Provider Dashboards:**
   - OpenAI: https://platform.openai.com/usage
   - Anthropic: https://console.anthropic.com/

2. **Application Health Check:**
   ```bash
   curl http://localhost:3000/api/erd/health
   ```

### Key Metrics to Watch

- **Request volume**: Daily/monthly API calls
- **Error rate**: Failed requests percentage
- **Response time**: Average API response latency
- **Cost**: Monthly API usage costs
- **Rate limits**: Approaching provider limits

### Setting Up Alerts

1. **Budget Alerts:**
   - Set alerts at 80% and 95% of monthly budget
   - Configure multiple email recipients
   - Integrate with incident management tools

2. **Error Rate Alerts:**
   - Alert if error rate exceeds 10%
   - Monitor for authentication failures
   - Track rate limit violations

## Troubleshooting

### Common Issues

#### ❌ "Invalid API key"
```json
{
  "apiKeyValid": false,
  "details": "Invalid OpenAI API key"
}
```

**Solutions:**
1. Verify API key is correct (no extra spaces/characters)
2. Check if key has been revoked or expired
3. Ensure key has required permissions
4. Verify correct provider is configured

#### ⚠️ "Rate limit reached"
```json
{
  "status": "degraded",
  "details": "OpenAI API rate limit reached"
}
```

**Solutions:**
1. Wait for rate limit to reset
2. Upgrade to higher tier plan
3. Implement request queuing
4. Optimize request frequency

#### 🔒 "API key not configured"
```json
{
  "apiKeyValid": false,
  "details": "API key not configured"
}
```

**Solutions:**
1. Set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` environment variable
2. Restart the application after setting variables
3. Verify `.env` file is in correct location

### Emergency Procedures

#### API Key Compromise
1. **Immediately revoke** the compromised key in provider dashboard
2. **Generate new key** using service account
3. **Update environment variables** in all environments
4. **Restart applications** to use new key
5. **Review usage logs** for unauthorized activity
6. **Document incident** for future reference

#### Service Outage
1. Check provider status pages:
   - OpenAI: https://status.openai.com
   - Anthropic: https://status.anthropic.com
2. Monitor application health endpoint
3. Consider fallback options or graceful degradation
4. Communicate status to users if needed

## Cost Management

### Optimization Tips

1. **Use appropriate models:**
   - GPT-3.5-turbo for simple tasks
   - GPT-4 for complex analysis
   - Claude Haiku for fast responses

2. **Optimize prompts:**
   - Be specific and concise
   - Avoid unnecessary context
   - Use shorter input when possible

3. **Implement caching:**
   - Cache similar queries
   - Store common schema analyses
   - Reuse relationship explanations

4. **Set usage limits:**
   - Implement rate limiting
   - Set monthly budget caps
   - Monitor per-user usage

### Budget Planning

**Estimated Costs (as of 2025):**
- OpenAI GPT-4: ~$0.03-0.06 per 1K tokens
- OpenAI GPT-3.5-turbo: ~$0.002 per 1K tokens
- Anthropic Claude: ~$0.008-0.024 per 1K tokens

**Typical ERD Builder Usage:**
- Schema analysis: 500-2000 tokens per request
- SQL generation: 300-1000 tokens per request
- Relationship explanation: 400-800 tokens per request

## Compliance and Governance

### Data Privacy

1. **No sensitive data in prompts:**
   - Only send schema structure, not actual data
   - Remove personal information from examples
   - Use generic column names in documentation

2. **Audit logging:**
   - Log all API requests (without sensitive data)
   - Track user interactions with LLM features
   - Maintain compliance records

3. **Data retention:**
   - Clear chat sessions regularly
   - Don't store API responses long-term
   - Follow your organization's data policies

### Compliance Requirements

For regulated industries:
- Review provider's compliance certifications
- Ensure API usage meets your compliance standards
- Document LLM usage in compliance reports
- Consider on-premises alternatives if required

## FAQ

**Q: Can I use my personal OpenAI account for the company application?**
A: No, use a service account API key for production applications to ensure continuity.

**Q: How often should I rotate API keys?**
A: Every 90 days is recommended, or immediately if compromise is suspected.

**Q: What happens if my API key is invalid?**
A: The application will gracefully degrade - ERD viewing works normally but LLM features will be disabled.

**Q: Can I use both OpenAI and Anthropic simultaneously?**
A: Currently, the application supports one provider at a time. Configure `LLM_PROVIDER` to choose.

**Q: How do I monitor API costs?**
A: Use the provider's dashboard for detailed usage and cost tracking, plus monitor the `/api/erd/health` endpoint.

---

For additional support, check the troubleshooting section or contact your development team.