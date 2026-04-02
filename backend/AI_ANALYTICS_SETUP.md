# AI-Powered Analytics Setup

## Overview
The Reports & Analytics section now features AI-generated descriptive analytics powered by Groq's LLaMA model, replacing the static "Graduate Employment Overview" section.

## Features
- Real-time AI analysis of graduate employment data
- Comprehensive narrative insights
- Professional analytical tone
- Automatic data interpretation
- Trend identification and actionable recommendations

## Setup Instructions

### 1. Get Groq API Key

1. Visit [Groq Console](https://console.groq.com/)
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy the API key

### 2. Configure Backend

Add the Groq API key to your backend `.env` file:

```bash
# Navigate to backend directory
cd backend

# Edit .env file
nano .env  # or use your preferred editor
```

Add this line:
```
GROQ_API_KEY=your_actual_groq_api_key_here
```

### 3. Restart Server

If using XAMPP:
- Restart Apache

If using PHP built-in server:
```bash
php -S localhost:8000
```

## API Endpoint

**Endpoint:** `GET /api/reports/ai-analytics.php`

**Response:**
```json
{
  "success": true,
  "data": {
    "overview": {
      "total_graduates": 100,
      "total_employed": 85,
      "total_employed_local": 70,
      "total_employed_abroad": 15,
      "total_aligned": 60,
      "employment_rate": 85.0,
      "alignment_rate": 70.6
    },
    "ai_analysis": "AI-generated narrative analysis..."
  }
}
```

## Model Information

- **Provider:** Groq
- **Model:** llama-3.3-70b-versatile
- **Temperature:** 0.7
- **Max Tokens:** 800

## Cost Considerations

Groq offers:
- Free tier with generous limits
- Fast inference speeds
- Cost-effective for production use

Check [Groq Pricing](https://groq.com/pricing/) for current rates.

## Troubleshooting

### "GROQ_API_KEY not configured" Error
- Ensure `.env` file exists in backend directory
- Verify `GROQ_API_KEY` is set correctly
- Restart your web server

### "AI service unavailable" Error
- Check your internet connection
- Verify API key is valid
- Check Groq service status

### AI Analysis Not Loading
- Check browser console for errors
- Verify backend API is accessible
- Check CORS configuration

## Security Notes

- Never commit `.env` file to version control
- Keep API keys secure
- Use environment variables in production
- Consider rate limiting for production deployments

## Future Enhancements

Potential improvements:
- Caching AI responses to reduce API calls
- Multiple AI model support
- Custom prompt templates
- Historical trend analysis
- Predictive analytics
