# 🤖 LLM API Setup Guide

Quick setup guide for enabling AI-powered ERD analysis features.

## 🚀 Quick Start

1. **Copy environment template:**
   ```bash
   cp .env.example .env
   ```

2. **Get your API key:**
   - **OpenAI**: [Create Service Account Key](https://platform.openai.com/api-keys)
   - **Anthropic**: [Create API Key](https://console.anthropic.com/)

3. **Configure `.env` file:**
   ```bash
   # For OpenAI (Recommended)
   LLM_PROVIDER=openai
   OPENAI_API_KEY=sk-your-service-account-key-here
   LLM_MODEL=gpt-4-turbo-preview
   
   # For Anthropic
   # LLM_PROVIDER=anthropic
   # ANTHROPIC_API_KEY=your-anthropic-key-here
   # LLM_MODEL=claude-3-haiku-20240307
   ```

4. **Start the application:**
   ```bash
   npm run dev
   ```

5. **Verify setup:**
   ```bash
   curl http://localhost:3000/api/erd/health
   ```
   Look for: `"apiKeyValid": true`

## 🎯 Features Enabled

With a valid API key, users can:
- ✅ **Chat with ERD schemas** - Ask natural language questions
- ✅ **Generate SQL queries** - Convert descriptions to SQL
- ✅ **Explain relationships** - Understand table connections  
- ✅ **Analyze patterns** - Detect junction tables, audit trails
- ✅ **Get recommendations** - Schema optimization tips

## 🛡️ Security Best Practices

- ⚠️ **Use Service Account keys** (not personal keys)
- ⚠️ **Never commit `.env` to git** (already in `.gitignore`)
- ⚠️ **Rotate keys every 90 days**
- ⚠️ **Monitor usage and costs**

## 📚 Detailed Documentation

For comprehensive setup, security, and troubleshooting:
👉 **[Full API Key Management Guide](./docs/api-key-management.md)**

## ❓ Quick Troubleshooting

**"API key not configured"**
- Check if `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is set in `.env`
- Restart the application after setting environment variables

**"Invalid API key"**  
- Verify the key is copied correctly (no extra spaces)
- Check if the key has been revoked in the provider dashboard
- Ensure the key has appropriate permissions

**"Rate limit reached"**
- Wait for the rate limit to reset
- Consider upgrading your API plan
- Monitor usage in provider dashboard

## 💰 Cost Considerations

**Typical usage costs:**
- Schema analysis: ~$0.01-0.05 per query
- SQL generation: ~$0.005-0.02 per query  
- Complex analysis: ~$0.02-0.10 per query

**Optimization tips:**
- Use GPT-3.5-turbo for simple queries
- Cache common schema analyses
- Set monthly budget alerts

---

🎉 **Ready to explore your database schemas with AI!**