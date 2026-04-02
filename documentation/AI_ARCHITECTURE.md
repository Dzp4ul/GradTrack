# AI Analytics Architecture

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
│                    (React Frontend - Reports)                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ 1. User opens Overview tab
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND COMPONENT                           │
│                  (Reports.tsx - Overview)                       │
│                                                                 │
│  • Triggers fetchAIAnalytics()                                 │
│  • Shows loading spinner                                       │
│  • Displays AI-generated content                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ 2. HTTP GET Request
                             │    /api/reports/ai-analytics.php
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND API ENDPOINT                         │
│              (api/reports/ai-analytics.php)                     │
│                                                                 │
│  Step 1: Fetch graduate data from database                    │
│  ├─ Total graduates                                           │
│  ├─ Employment statistics                                     │
│  ├─ Local vs abroad distribution                             │
│  └─ Job alignment data                                        │
│                                                                 │
│  Step 2: Prepare data context                                 │
│  └─ Format data as JSON                                       │
│                                                                 │
│  Step 3: Call Groq API                                        │
│  ├─ Model: llama-3.3-70b-versatile                          │
│  ├─ Temperature: 0.7                                          │
│  ├─ Max tokens: 800                                           │
│  └─ System prompt: Expert analyst                            │
│                                                                 │
│  Step 4: Return response                                      │
│  └─ JSON with overview + AI analysis                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ 3. cURL POST Request
                             │    https://api.groq.com/openai/v1/
                             │    chat/completions
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        GROQ API                                 │
│                  (External AI Service)                          │
│                                                                 │
│  • Receives data context                                       │
│  • Processes with LLaMA 3.3 70B model                         │
│  • Generates narrative analysis                               │
│  • Returns AI-generated text                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ 4. AI Response
                             │    (Narrative analysis)
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND PROCESSING                           │
│                                                                 │
│  • Receives AI response                                        │
│  • Validates response                                          │
│  • Formats JSON response                                       │
│  • Returns to frontend                                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ 5. JSON Response
                             │    { success, data: { overview, 
                             │      ai_analysis } }
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND RENDERING                           │
│                                                                 │
│  • Receives AI analysis                                        │
│  • Hides loading spinner                                       │
│  • Splits text into paragraphs                                │
│  • Displays in styled card                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND LAYER                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Reports.tsx                                                    │
│  ├─ State Management                                           │
│  │  ├─ aiAnalysis: string                                     │
│  │  └─ aiLoading: boolean                                     │
│  │                                                             │
│  ├─ Functions                                                  │
│  │  └─ fetchAIAnalytics()                                     │
│  │                                                             │
│  └─ UI Components                                              │
│     ├─ Loading Spinner                                        │
│     ├─ AI Analytics Card                                      │
│     │  ├─ Sparkles Icon                                      │
│     │  ├─ "Powered by AI" Badge                             │
│     │  └─ Paragraph Display                                  │
│     └─ Error Handling                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ HTTP/REST
                             │
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND LAYER                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ai-analytics.php                                              │
│  ├─ Database Connection                                        │
│  │  └─ config/database.php                                    │
│  │                                                             │
│  ├─ Data Collection                                            │
│  │  ├─ Survey responses                                       │
│  │  ├─ Employment status                                      │
│  │  ├─ Work location                                          │
│  │  └─ Job alignment                                          │
│  │                                                             │
│  ├─ AI Integration                                             │
│  │  ├─ Groq API client (cURL)                                │
│  │  ├─ Prompt engineering                                     │
│  │  └─ Response parsing                                       │
│  │                                                             │
│  └─ Response Formatting                                        │
│     └─ JSON encoder                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ HTTPS/API
                             │
┌─────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Groq API                                                       │
│  ├─ Model: llama-3.3-70b-versatile                           │
│  ├─ Endpoint: /openai/v1/chat/completions                    │
│  └─ Authentication: Bearer token                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
┌──────────────┐
│   Database   │
│  (MySQL/RDS) │
└──────┬───────┘
       │
       │ Survey Responses
       │ Graduate Data
       │
       ▼
┌──────────────────────┐
│  Data Aggregation    │
│  • Count employed    │
│  • Calculate rates   │
│  • Group by location │
└──────┬───────────────┘
       │
       │ Structured Data
       │
       ▼
┌──────────────────────┐
│  Prompt Engineering  │
│  • System context    │
│  • Data injection    │
│  • Instructions      │
└──────┬───────────────┘
       │
       │ Formatted Prompt
       │
       ▼
┌──────────────────────┐
│    Groq AI Model     │
│  • Process context   │
│  • Generate insights │
│  • Format narrative  │
└──────┬───────────────┘
       │
       │ AI-Generated Text
       │
       ▼
┌──────────────────────┐
│  Response Handling   │
│  • Validate output   │
│  • Format JSON       │
│  • Error handling    │
└──────┬───────────────┘
       │
       │ API Response
       │
       ▼
┌──────────────────────┐
│   Frontend Display   │
│  • Parse paragraphs  │
│  • Apply styling     │
│  • Show to user      │
└──────────────────────┘
```

## Configuration Flow

```
┌─────────────────────┐
│  Developer Setup    │
│  1. Get API key     │
│  2. Run setup script│
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   .env File         │
│  GROQ_API_KEY=xxx   │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Backend Reads      │
│  getenv('GROQ_..') │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  API Authentication │
│  Bearer: $apiKey    │
└─────────────────────┘
```

## Error Handling Flow

```
┌─────────────────────┐
│   API Request       │
└─────────┬───────────┘
          │
          ▼
     ┌────────┐
     │Success?│
     └───┬─┬──┘
         │ │
    Yes  │ │  No
         │ │
         ▼ ▼
    ┌────┐ ┌──────────────────┐
    │Show│ │  Error Handling  │
    │Data│ │  • Log error     │
    └────┘ │  • Return message│
           │  • Show fallback │
           └──────────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────┐
│         Environment Variables           │
│  • Stored in .env (not in git)         │
│  • Loaded at runtime                   │
│  • Never exposed to frontend           │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│         Backend API Layer               │
│  • Validates requests                   │
│  • Manages API keys                     │
│  • Handles authentication               │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│         External API (Groq)             │
│  • HTTPS encryption                     │
│  • Bearer token auth                    │
│  • Rate limiting                        │
└─────────────────────────────────────────┘
```

## Performance Considerations

```
Request Timeline:
├─ 0ms    : User clicks Overview tab
├─ 10ms   : Frontend initiates request
├─ 50ms   : Backend receives request
├─ 100ms  : Database query completes
├─ 150ms  : Groq API request sent
├─ 1500ms : AI processing (1-3 seconds)
├─ 1550ms : Response received
├─ 1600ms : Frontend renders
└─ 1650ms : User sees AI analysis

Total: ~1.5-3 seconds
```

## Scalability Notes

```
Current Architecture:
• Synchronous requests
• No caching
• Direct API calls

Recommended for Production:
• Implement response caching (1 hour TTL)
• Queue system for high traffic
• CDN for static assets
• Load balancing for backend
• Rate limiting per user
```

---

This architecture provides a clear separation of concerns, secure API key management, and efficient data flow from database to AI to user interface.
