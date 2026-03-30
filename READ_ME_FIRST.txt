
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║              🚀 GRADTRACK - QUICK START GUIDE 🚀             ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

┌──────────────────────────────────────────────────────────────┐
│  📖 HOW TO RUN LOCALLY                                       │
└──────────────────────────────────────────────────────────────┘

  ⚡ EASIEST WAY:
  
     Just double-click this file:
     
     ► start-gradtrack.bat
     
     This starts EVERYTHING automatically!


  📋 OR START SEPARATELY:
  
     Backend:  ► start-backend.bat
     Frontend: ► start-frontend.bat


  🌐 THEN OPEN YOUR BROWSER:
  
     http://localhost:5173


┌──────────────────────────────────────────────────────────────┐
│  📚 DOCUMENTATION                                            │
└──────────────────────────────────────────────────────────────┘

  ⭐ START_HERE.md          - Main entry point
  📖 HOW_TO_RUN.md          - How to run locally
  🚀 QUICK_START.md         - Deploy to production
  📋 QUICK_REFERENCE.md     - Common commands
  🏗️  ARCHITECTURE.md        - System architecture
  ✅ VERIFICATION.md         - Testing checklist


┌──────────────────────────────────────────────────────────────┐
│  🔧 FIRST TIME SETUP                                         │
└──────────────────────────────────────────────────────────────┘

  1. Run: setup.bat
  
  2. Update: backend/.env (database credentials)
  
  3. Update: frontend/.env.development (API URL)
  
  4. Run: start-gradtrack.bat


┌──────────────────────────────────────────────────────────────┐
│  🚀 DEPLOY TO PRODUCTION                                     │
└──────────────────────────────────────────────────────────────┘

  Read: QUICK_START.md
  
  Steps:
    1. Deploy backend to AWS EC2 (15 min)
    2. Deploy frontend to AWS Amplify (3 min)
    3. Update CORS settings (1 min)
  
  Total: 20 minutes


┌──────────────────────────────────────────────────────────────┐
│  📁 PROJECT STRUCTURE                                        │
└──────────────────────────────────────────────────────────────┘

  GradTrack/
  ├── frontend/              React + TypeScript + Vite
  ├── backend/               PHP API
  ├── database/              SQL files
  │
  ├── start-gradtrack.bat    ⚡ START HERE
  ├── start-backend.bat      Backend only
  ├── start-frontend.bat     Frontend only
  │
  ├── HOW_TO_RUN.md          📖 How to run guide
  ├── START_HERE.md          ⭐ Main guide
  └── QUICK_START.md         🚀 Deployment guide


┌──────────────────────────────────────────────────────────────┐
│  ❓ NEED HELP?                                               │
└──────────────────────────────────────────────────────────────┘

  Can't run backend?
    → Read: HOW_TO_RUN.md
  
  Want to deploy?
    → Read: QUICK_START.md
  
  Need commands?
    → Read: QUICK_REFERENCE.md
  
  Want to understand the system?
    → Read: ARCHITECTURE.md


┌──────────────────────────────────────────────────────────────┐
│  ✅ SYSTEM STATUS                                            │
└──────────────────────────────────────────────────────────────┘

  ✅ Production-Ready
  ✅ Secure (no hardcoded credentials)
  ✅ Well-Documented
  ✅ Easy to Deploy
  
  Deployment Difficulty: 10/10 ⭐⭐⭐⭐⭐


╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║         👉 DOUBLE-CLICK: start-gradtrack.bat 👈              ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
