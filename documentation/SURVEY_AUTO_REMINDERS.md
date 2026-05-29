# Survey Auto Reminders

GradTrack can send automatic email reminders to graduates who have not submitted an active survey.

## Recommended Interval

Use **3 days** between reminders. It is frequent enough for follow-up without feeling too aggressive.

The interval comes from:

1. `SURVEY_REMINDER_INTERVAL_DAYS` in `backend/.env`, when set.
2. System Settings > Survey Operations > Reminder Interval.
3. A fallback value of `3`.

## What The Job Does

- Finds active surveys.
- Finds graduates with valid email addresses and no response for that survey.
- Skips graduates already reminded within the configured interval.
- Logs sent, failed, and skipped reminders in `survey_reminder_logs`.
- Counts manual reminders from the admin/dean screen, so auto reminders do not immediately duplicate them.

## Test Without Sending

From the project root:

```powershell
php backend/api/surveys/auto-reminders.php --dry-run --limit=20
```

On XAMPP, use the full PHP path if needed:

```powershell
C:\xampp\php\php.exe backend/api/surveys/auto-reminders.php --dry-run --limit=20
```

## Send Reminders

```powershell
C:\xampp\php\php.exe backend/api/surveys/auto-reminders.php --limit=100
```

## Schedule On Windows

Use Windows Task Scheduler:

- Program/script: `C:\xampp\php\php.exe`
- Arguments: `C:\xampp\htdocs\GradTrack\backend\api\surveys\auto-reminders.php --limit=100`
- Start in: `C:\xampp\htdocs\GradTrack`
- Trigger: Daily

The job can run daily because GradTrack checks the 3-day reminder interval before sending.

## HTTP Scheduling

If your host can only call a URL, set `SURVEY_REMINDER_CRON_SECRET` in `backend/.env`, then call:

```text
https://your-backend-domain/api/surveys/auto-reminders.php?secret=YOUR_SECRET
```

CLI scheduling is preferred when available.
