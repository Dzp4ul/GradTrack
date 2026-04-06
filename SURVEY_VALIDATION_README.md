# 🔐 Survey Validation System - Quick Reference

## What is This?

A secure system that ensures only **verified graduates** from your registrar database can access and submit surveys. Prevents duplicate submissions and maintains data integrity.

---

## 🚀 Quick Start (3 Steps)

### 1️⃣ Run Database Migration
Open phpMyAdmin → Run this SQL:
```sql
USE gradtrackdb;
-- Then paste contents of: database/add_survey_tokens.sql
```

### 2️⃣ Restart Servers
```bash
# Backend
cd backend && php -S localhost:8000

# Frontend  
cd frontend && npm run dev
```

### 3️⃣ Test It
Visit: `http://localhost:5173/survey-verify?survey_id=1`

---

## 🔗 How to Share Surveys

### Option 1: Direct Link
```
https://gradtrack.com/survey-verify?survey_id=1
```

### Option 2: Email
```
Subject: Complete Your Graduate Survey

Click here to complete the survey:
https://gradtrack.com/survey-verify?survey_id=1

You'll need your student number and last name.
```

### Option 3: Facebook/Social Media
```
📊 Graduates! Complete our employment survey:
[link]

Need: Student number + Last name
```

### Option 4: QR Code
Generate QR code pointing to the verification URL

---

## ✅ How It Works (Simple)

```
Graduate clicks link
    ↓
Enters student number + last name
    ↓
System checks registrar database
    ↓
If found → Show survey
    ↓
Graduate completes survey
    ↓
Submit → Done!
    ↓
Cannot submit again ✓
```

---

## 🔐 What Gets Validated?

1. ✅ Student number exists in registrar
2. ✅ Last name matches
3. ✅ Program matches (optional)
4. ✅ Survey is active
5. ✅ Not already submitted
6. ✅ Token not expired (30 min)

---

## 📁 Files Created

### Backend (PHP)
- `backend/api/surveys/verify.php` - Verify identity
- `backend/api/surveys/validate-token.php` - Validate token
- `backend/api/surveys/programs.php` - Get programs
- `backend/api/surveys/responses.php` - Submit survey (updated)

### Frontend (React)
- `frontend/src/pages/SurveyVerification.tsx` - Verification page
- `frontend/src/pages/Survey.tsx` - Survey form (updated)
- `frontend/src/App.tsx` - Routes (updated)

### Database
- `database/add_survey_tokens.sql` - New table

---

## 🗄️ Database Table

```sql
survey_tokens
├── id
├── survey_id
├── graduate_id
├── token (unique)
├── expires_at
├── submitted_at (NULL until submitted)
└── ip_address
```

---

## 🧪 Testing

1. Visit: `/survey-verify?survey_id=1`
2. Enter valid student number + last name
3. Should redirect to survey
4. Complete and submit
5. Try again → Should show "already submitted"

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Graduate not found" | Check student_id in graduates table |
| "Token expired" | Normal after 30 min, verify again |
| "Already submitted" | Working correctly! |
| Programs not loading | Check programs table has data |

---

## 📊 Admin Workflow

1. Create survey in admin panel
2. Set status to "active"
3. Copy survey ID from URL
4. Share link: `/survey-verify?survey_id=X`
5. Monitor responses in admin panel

---

## 🔒 Security Features

- ✅ Validates against registrar records
- ✅ Unique token per graduate
- ✅ 30-minute expiration
- ✅ Prevents duplicates
- ✅ Tracks IP addresses
- ✅ Full audit trail

---

## 📚 Documentation

- **SURVEY_VALIDATION_SETUP.md** - 5-minute setup guide
- **SURVEY_VALIDATION_GUIDE.md** - Complete documentation
- **SURVEY_VALIDATION_DIAGRAM.html** - Visual flow diagram
- **SURVEY_VALIDATION_SUMMARY.md** - Implementation summary

---

## 💡 Pro Tips

✅ Test with your own student record first
✅ Share via multiple channels (email, SMS, Facebook)
✅ Monitor submission rate in admin panel
✅ Export responses regularly

---

## ❓ FAQ

**Q: Can graduates submit multiple times?**
A: No, system prevents duplicate submissions.

**Q: What if token expires?**
A: Graduate can verify identity again to get new token.

**Q: Do graduates need to create an account?**
A: No, just student number and last name.

**Q: How long is the token valid?**
A: 30 minutes (configurable).

**Q: Can I track who submitted?**
A: Yes, full audit trail with IP addresses and timestamps.

---

## 🎯 Success Indicators

You'll know it's working when:
- ✅ Valid credentials redirect to survey
- ✅ Invalid credentials show error
- ✅ Survey shows graduate's name
- ✅ After submission, cannot submit again
- ✅ Token expires after 30 minutes

---

## 📞 Need Help?

1. Check documentation files
2. Review error messages in browser console
3. Verify database tables exist
4. Ensure servers are running
5. Contact system administrator

---

**Status:** ✅ Production Ready
**Version:** 1.0.0
**Last Updated:** December 2024
