# Quick Start: AI Analytics

## 5-Minute Setup

### Step 1: Get API Key (2 minutes)
1. Go to https://console.groq.com/
2. Sign up with your email
3. Click "API Keys" in the sidebar
4. Click "Create API Key"
5. Copy the key

### Step 2: Configure Backend (1 minute)

**Windows (XAMPP):**
```cmd
cd c:\xampp\htdocs\GradTrack\backend
setup-ai.bat
```

**Linux/Mac:**
```bash
cd backend
chmod +x setup-ai.sh
./setup-ai.sh
```

**Manual Setup:**
Edit `backend/.env` and add:
```
GROQ_API_KEY=your_api_key_here
```

### Step 3: Restart Server (1 minute)

**XAMPP:**
- Stop Apache
- Start Apache

**PHP Built-in:**
```bash
cd backend
php -S localhost:8000
```

### Step 4: Test (1 minute)
1. Open your GradTrack admin panel
2. Navigate to "Reports & Analytics"
3. Click "Overview" tab
4. Scroll down to see "AI-Powered Descriptive Analytics"

## What You'll See

The AI will generate a comprehensive analysis including:
- Employment trends and patterns
- Key insights about graduate outcomes
- Comparison of local vs. overseas employment
- Job alignment analysis
- Actionable recommendations

## Example Output

> "The graduate employment data reveals a strong employment rate of 85%, with 100 graduates tracked in the system. Among the employed graduates, there is a notable preference for local employment, with 70 graduates (82.4%) working within the Philippines compared to 15 (17.6%) working abroad..."

## Troubleshooting

**"AI analysis temporarily unavailable"**
- Check your internet connection
- Verify API key is correct
- Ensure server is restarted

**Loading spinner doesn't stop**
- Check browser console (F12)
- Verify backend API is accessible
- Check CORS settings

**"GROQ_API_KEY not configured"**
- Ensure .env file has the key
- Restart your web server
- Check file permissions

## Cost

Groq offers:
- **Free tier**: Generous limits for testing
- **Fast**: Sub-second response times
- **Affordable**: Cost-effective for production

Current usage: ~1 API call per page load on Overview tab

## Need Help?

See full documentation: `backend/AI_ANALYTICS_SETUP.md`
