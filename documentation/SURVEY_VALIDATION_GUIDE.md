# Survey Validation System - Implementation Guide

## Overview

The GradTrack survey validation system ensures that only verified graduates from the registrar database can access and submit surveys. This prevents duplicate submissions and maintains data integrity.

## Features

✅ **Identity Verification** - Validates student number, last name, and program against registrar records
✅ **Token-Based Access** - Generates unique, time-limited tokens for survey access
✅ **Duplicate Prevention** - Prevents the same graduate from submitting multiple times
✅ **Session Management** - 30-minute session timeout for security
✅ **Audit Trail** - Tracks IP addresses and submission timestamps

## Architecture

```
Graduate Journey:
1. Visit survey link → /survey-verify?survey_id=X
2. Enter credentials (student number, last name, program)
3. System validates against registrar database
4. If valid → Generate token → Store in session
5. Redirect to survey form
6. Complete survey
7. Submit → Mark token as used
8. Prevent future submissions
```

## Database Schema

### survey_tokens Table

```sql
CREATE TABLE survey_tokens (
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
);
```

## API Endpoints

### 1. Verify Graduate Identity

**Endpoint:** `POST /api/surveys/verify.php`

**Request:**
```json
{
  "student_number": "2020-12345",
  "last_name": "Doe",
  "program": "BSCS",
  "survey_id": 1
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Verification successful",
  "data": {
    "token": "a7f3c9e2b8d4f1a6c5e9b2d8f4a1c7e3...",
    "graduate_id": 101,
    "graduate_name": "John Doe",
    "program": "Bachelor of Science in Computer Science"
  }
}
```

**Error Responses:**
- `404` - Graduate not found in registrar
- `403` - Program mismatch
- `409` - Survey already submitted

### 2. Validate Token

**Endpoint:** `POST /api/surveys/validate-token.php`

**Request:**
```json
{
  "token": "a7f3c9e2b8d4f1a6c5e9b2d8f4a1c7e3..."
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Token is valid",
  "data": {
    "survey_id": 1,
    "graduate_id": 101,
    "graduate_name": "John Doe",
    "student_id": "2020-12345",
    "survey_title": "Graduate Employment Survey",
    "expires_at": "2024-12-15 15:30:00"
  }
}
```

**Error Responses:**
- `404` - Invalid token
- `403` - Token expired
- `409` - Survey already submitted

### 3. Submit Survey Response

**Endpoint:** `POST /api/surveys/responses.php`

**Request:**
```json
{
  "survey_id": 1,
  "graduate_id": 101,
  "token": "a7f3c9e2b8d4f1a6c5e9b2d8f4a1c7e3...",
  "responses": {
    "1": "Employed",
    "2": "1-3 months",
    "3": "Yes, directly related"
  }
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Survey response saved successfully",
  "id": 42
}
```

### 4. Get Programs List

**Endpoint:** `GET /api/surveys/programs.php`

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Bachelor of Science in Computer Science",
      "code": "BSCS",
      "description": "Computer Science program"
    }
  ]
}
```

## Frontend Routes

### 1. Survey Verification Page
**Route:** `/survey-verify?survey_id=X`
**Component:** `SurveyVerification.tsx`
**Purpose:** Graduate identity verification

### 2. Survey Form Page
**Route:** `/survey?survey_id=X`
**Component:** `Survey.tsx`
**Purpose:** Survey form (requires valid token)

## Security Features

### 1. Token Generation
- 64-character random hex string
- Cryptographically secure (using `random_bytes()`)
- Unique per graduate per survey
- 30-minute expiration

### 2. Validation Layers

**Layer 1: Identity Verification**
```php
// Check registrar database
SELECT * FROM graduates 
WHERE student_id = ? 
AND last_name LIKE ?
AND program matches
```

**Layer 2: Duplicate Check**
```php
// Check if already submitted
SELECT * FROM survey_tokens 
WHERE survey_id = ? 
AND graduate_id = ? 
AND submitted_at IS NOT NULL
```

**Layer 3: Token Validation**
```php
// Validate token before survey access
- Token exists?
- Token not expired?
- Token not used?
- Survey still active?
```

**Layer 4: Submission Validation**
```php
// On survey submission
- Validate token again
- Check duplicate in survey_responses
- Mark token as submitted
- Record IP address
```

### 3. Session Management

**Frontend (sessionStorage):**
```javascript
sessionStorage.setItem('survey_token', token);
sessionStorage.setItem('graduate_id', graduateId);
sessionStorage.setItem('graduate_name', name);
```

**Token Expiration:**
- Generated: 30 minutes validity
- Checked on every page load
- Cleared after submission

## Usage Flow

### For Graduates

1. **Receive Survey Link**
   - Via email, SMS, Facebook, or QR code
   - Link: `https://gradtrack.com/survey-verify?survey_id=1`

2. **Verify Identity**
   - Enter student number (e.g., 2020-12345)
   - Enter last name (e.g., Doe)
   - Select program (optional)
   - Click "Verify & Continue"

3. **Access Survey**
   - System validates credentials
   - Generates token
   - Redirects to survey form
   - Shows welcome message with name

4. **Complete Survey**
   - Answer all required questions
   - Navigate through sections
   - Auto-save draft (localStorage)
   - Submit survey

5. **Confirmation**
   - Success message
   - Token marked as used
   - Cannot submit again

### For Administrators

1. **Create Survey**
   - Admin creates survey in admin panel
   - Set status to "active"

2. **Share Survey Link**
   - Copy link: `/survey-verify?survey_id=X`
   - Share via:
     - Email blast
     - Facebook post
     - SMS campaign
     - QR code posters
     - School website

3. **Monitor Responses**
   - View responses in admin panel
   - Check submission status
   - Export data for analysis

## Installation

### Step 1: Run Database Migration

```bash
# Navigate to database folder
cd database

# Run SQL file in phpMyAdmin or MySQL CLI
mysql -u root -p gradtrackdb < add_survey_tokens.sql
```

Or manually execute in phpMyAdmin:
```sql
USE gradtrackdb;
-- Copy and paste contents of add_survey_tokens.sql
```

### Step 2: Verify Backend Files

Ensure these files exist:
- `backend/api/surveys/verify.php`
- `backend/api/surveys/validate-token.php`
- `backend/api/surveys/programs.php`
- `backend/api/surveys/responses.php` (updated)

### Step 3: Verify Frontend Files

Ensure these files exist:
- `frontend/src/pages/SurveyVerification.tsx`
- `frontend/src/pages/Survey.tsx` (updated)
- `frontend/src/App.tsx` (updated with route)

### Step 4: Test the System

1. **Create Test Graduate**
```sql
INSERT INTO graduates (student_id, first_name, last_name, program_id, year_graduated)
VALUES ('2024-TEST', 'Test', 'User', 1, 2024);
```

2. **Create Active Survey**
   - Login to admin panel
   - Create a survey
   - Set status to "active"

3. **Test Verification**
   - Visit: `http://localhost:5173/survey-verify?survey_id=1`
   - Enter: Student Number: `2024-TEST`, Last Name: `User`
   - Should redirect to survey form

4. **Test Duplicate Prevention**
   - Complete and submit survey
   - Try to verify again
   - Should show "already submitted" error

## Troubleshooting

### Issue: "Graduate not found"
**Solution:** Check that student_id and last_name match exactly in graduates table

### Issue: "Token expired"
**Solution:** Token expires after 30 minutes. Verify identity again.

### Issue: "Survey already submitted"
**Solution:** This is expected behavior. Graduate can only submit once.

### Issue: "Invalid token"
**Solution:** 
- Clear sessionStorage
- Verify identity again
- Check that survey is still active

### Issue: Programs not loading
**Solution:** Check that `programs` table has data and API endpoint is accessible

## Security Best Practices

1. ✅ **Never expose tokens in URLs** - Use sessionStorage only
2. ✅ **Always validate tokens server-side** - Don't trust frontend
3. ✅ **Use HTTPS in production** - Encrypt data in transit
4. ✅ **Rate limit verification attempts** - Prevent brute force
5. ✅ **Log all verification attempts** - Audit trail for security
6. ✅ **Clear tokens after submission** - Prevent reuse
7. ✅ **Set appropriate CORS headers** - Restrict API access

## Future Enhancements

### Optional Features to Add:

1. **Email OTP (2FA)**
   - Send verification code to graduate's email
   - Add extra security layer

2. **SMS Verification**
   - Send code via SMS
   - Verify phone number

3. **Rate Limiting**
   - Max 5 verification attempts per IP per hour
   - Prevent brute force attacks

4. **Captcha**
   - Add reCAPTCHA on verification form
   - Prevent automated submissions

5. **Token Refresh**
   - Allow extending token expiration
   - Better user experience for long surveys

6. **Admin Dashboard**
   - View verification attempts
   - Monitor token usage
   - Track submission rates

## Support

For issues or questions:
- Check this documentation first
- Review error messages in browser console
- Check backend logs in `backend/logs/`
- Contact system administrator

---

**Last Updated:** December 2024
**Version:** 1.0.0
