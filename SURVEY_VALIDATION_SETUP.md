# Survey Validation System - Quick Setup

## 🚀 Quick Start (5 Minutes)

### Step 1: Run Database Migration (1 min)

Open phpMyAdmin and run this SQL:

```sql
USE gradtrackdb;

CREATE TABLE IF NOT EXISTS survey_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  graduate_id INT NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  submitted_at DATETIME NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE,
  UNIQUE KEY unique_survey_graduate (survey_id, graduate_id)
) ENGINE=InnoDB;

CREATE INDEX idx_token ON survey_tokens(token);
CREATE INDEX idx_survey_graduate ON survey_tokens(survey_id, graduate_id);
```

### Step 2: Verify Files Exist (1 min)

Check that these files were created:

**Backend:**
- ✅ `backend/api/surveys/verify.php`
- ✅ `backend/api/surveys/validate-token.php`
- ✅ `backend/api/surveys/programs.php`
- ✅ `backend/api/surveys/responses.php` (updated)

**Frontend:**
- ✅ `frontend/src/pages/SurveyVerification.tsx`
- ✅ `frontend/src/pages/Survey.tsx` (updated)
- ✅ `frontend/src/App.tsx` (updated)

### Step 3: Restart Development Servers (1 min)

```bash
# Backend (if using PHP built-in server)
cd backend
php -S localhost:8000

# Frontend
cd frontend
npm run dev
```

### Step 4: Test the System (2 min)

1. **Visit verification page:**
   ```
   http://localhost:5173/survey-verify?survey_id=1
   ```

2. **Enter test credentials:**
   - Student Number: Use any from your graduates table
   - Last Name: Match the graduate's last name
   - Program: Select matching program

3. **Should redirect to survey form**

4. **Complete and submit survey**

5. **Try to submit again - should show "already submitted"**

## ✅ Success Indicators

You'll know it's working when:

1. ✅ Verification page loads without errors
2. ✅ Programs dropdown shows your programs
3. ✅ Valid credentials redirect to survey
4. ✅ Invalid credentials show error message
5. ✅ Survey shows "Welcome, [Name]!" message
6. ✅ After submission, cannot submit again
7. ✅ Token is cleared from sessionStorage

## 🔗 How to Share Survey Links

### Method 1: Direct Link
```
https://gradtrack.com/survey-verify?survey_id=1
```

### Method 2: QR Code
Generate QR code pointing to verification URL

### Method 3: Email Template
```
Subject: Complete Your Graduate Survey

Dear Graduate,

Please complete our employment survey by clicking the link below:
https://gradtrack.com/survey-verify?survey_id=1

You will need:
- Your student number
- Your last name

Thank you!
```

### Method 4: Facebook Post
```
📊 Calling all graduates!

Help us improve by completing our employment survey.
Click here: [link]

You'll need your student number and last name to verify.
```

## 🐛 Quick Troubleshooting

### "Graduate not found"
→ Check student_id and last_name in graduates table

### "Token expired"
→ Normal after 30 minutes. Just verify again.

### "Survey already submitted"
→ Working as intended! Graduate can only submit once.

### Programs not loading
→ Check that programs table has data

### Page not found
→ Make sure frontend dev server is running

## 📊 How It Works (Simple)

```
1. Graduate visits link
   ↓
2. Enters student number + last name
   ↓
3. System checks registrar database
   ↓
4. If found → Generate token → Show survey
   ↓
5. Graduate completes survey
   ↓
6. Submit → Mark as completed
   ↓
7. Cannot submit again ✓
```

## 🔒 Security Features

- ✅ Validates against registrar records
- ✅ Unique token per graduate
- ✅ 30-minute session timeout
- ✅ Prevents duplicate submissions
- ✅ Tracks IP addresses
- ✅ Audit trail in database

## 📝 Next Steps

1. Create your survey in admin panel
2. Set survey status to "active"
3. Share verification link with graduates
4. Monitor responses in admin panel

## 💡 Pro Tips

- Test with your own student record first
- Share link via multiple channels (email, SMS, Facebook)
- Monitor submission rate in admin panel
- Export responses for analysis

---

**Need Help?** Check `SURVEY_VALIDATION_GUIDE.md` for detailed documentation.
