# Performance Optimization Deployment Checklist

Use this checklist to ensure the performance optimization is properly deployed.

## Pre-Deployment

- [ ] **Backup Database**
  ```bash
  mysqldump -u username -p database_name > backup_before_optimization.sql
  ```

- [ ] **Review Changes**
  - [ ] Read `PERFORMANCE_CHANGES_SUMMARY.md`
  - [ ] Review `PERFORMANCE_FIX_QUICKSTART.md`
  - [ ] Understand what indexes will be added

- [ ] **Test Environment Ready**
  - [ ] Database server is running
  - [ ] Have database credentials from `.env`
  - [ ] User has CREATE INDEX permission

## Deployment Steps

### Step 1: Apply Database Indexes

Choose one method:

**Option A: Automated Script (Recommended)**

- [ ] Windows: Run `backend/optimize-performance.bat`
- [ ] Linux/Mac: Run `backend/optimize-performance.sh`
- [ ] Verify success message appears

**Option B: Manual (phpMyAdmin)**

- [ ] Open phpMyAdmin
- [ ] Select GradTrack database
- [ ] Go to SQL tab
- [ ] Copy contents of `backend/api/database_indexes.sql`
- [ ] Paste and click "Go"
- [ ] Verify "Query OK" message

**Option C: MySQL Command Line**

- [ ] Navigate to backend directory
- [ ] Run: `mysql -u username -p database < api/database_indexes.sql`
- [ ] Verify no errors

### Step 2: Verify Indexes

- [ ] Run verification query:
  ```sql
  SHOW INDEX FROM mentors;
  SHOW INDEX FROM mentorship_requests;
  SHOW INDEX FROM job_posts;
  ```

- [ ] Confirm these indexes exist:
  - [ ] `idx_active_approved` on mentors
  - [ ] `idx_graduate_account` on mentors
  - [ ] `idx_mentor_status` on mentorship_requests
  - [ ] `idx_mentee_status` on mentorship_requests
  - [ ] `idx_active_approved` on job_posts
  - [ ] `idx_posted_by` on job_posts

### Step 3: Clear Caches

- [ ] **Browser Cache**
  - Press Ctrl+Shift+Delete
  - Select "Cached images and files"
  - Clear cache

- [ ] **PHP OpCache** (if enabled)
  ```php
  opcache_reset();
  ```

- [ ] **MySQL Query Cache** (if enabled)
  ```sql
  RESET QUERY CACHE;
  ```

### Step 4: Test Performance

- [ ] **Open Graduate Portal**
  - Navigate to graduate portal
  - Open DevTools (F12)
  - Go to Network tab
  - Reload page

- [ ] **Verify Loading Times**
  - [ ] Total page load < 2 seconds
  - [ ] `/api/mentorship/mentors` < 1 second
  - [ ] `/api/jobs/posts` < 1 second
  - [ ] `/api/mentorship/requests` < 1 second
  - [ ] All requests load in parallel (check waterfall)

- [ ] **Test Features**
  - [ ] Mentor list loads quickly
  - [ ] Job posts load quickly
  - [ ] Mentorship requests load quickly
  - [ ] Filters work correctly
  - [ ] Search works correctly
  - [ ] No console errors

### Step 5: Monitor

- [ ] **Check Database Performance**
  ```sql
  SHOW PROCESSLIST;
  ```
  - [ ] No slow queries
  - [ ] Queries complete quickly

- [ ] **Check Server Resources**
  - [ ] CPU usage normal
  - [ ] Memory usage normal
  - [ ] No errors in logs

## Post-Deployment

### Verification

- [ ] **Performance Metrics**
  - [ ] Portal loads in < 2 seconds
  - [ ] Mentor list < 1 second
  - [ ] Job posts < 1 second
  - [ ] Requests < 1 second

- [ ] **Functionality**
  - [ ] All features work correctly
  - [ ] No broken functionality
  - [ ] No console errors
  - [ ] No database errors

### Documentation

- [ ] Update deployment notes
- [ ] Document any issues encountered
- [ ] Note actual performance improvements
- [ ] Share results with team

## Rollback Plan (If Needed)

If issues occur, rollback by removing indexes:

- [ ] **Backup Current State**
  ```bash
  mysqldump -u username -p database_name > backup_after_optimization.sql
  ```

- [ ] **Remove Indexes**
  ```sql
  -- Mentors
  ALTER TABLE mentors DROP INDEX idx_active_approved;
  ALTER TABLE mentors DROP INDEX idx_graduate_account;
  ALTER TABLE mentors DROP INDEX idx_graduate_id;
  ALTER TABLE mentors DROP INDEX idx_industry;
  ALTER TABLE mentors DROP INDEX idx_created_at;
  
  -- Mentorship requests
  ALTER TABLE mentorship_requests DROP INDEX idx_mentor_status;
  ALTER TABLE mentorship_requests DROP INDEX idx_mentee_status;
  ALTER TABLE mentorship_requests DROP INDEX idx_requested_at;
  
  -- Job posts
  ALTER TABLE job_posts DROP INDEX idx_active_approved;
  ALTER TABLE job_posts DROP INDEX idx_posted_by;
  ALTER TABLE job_posts DROP INDEX idx_job_type;
  ALTER TABLE job_posts DROP INDEX idx_created_at;
  
  -- Continue for all indexes...
  ```

- [ ] **Restore Code**
  - Revert `backend/api/mentorship/mentors.php`
  - Revert `frontend/src/pages/GraduatePortal.tsx`

- [ ] **Test Rollback**
  - Verify portal still works
  - Check for errors

## Troubleshooting

### Issue: Indexes Not Created

**Symptoms:**
- Error during index creation
- SHOW INDEX doesn't show new indexes

**Solutions:**
- [ ] Check database user has CREATE INDEX permission
- [ ] Verify database connection
- [ ] Check for duplicate index names
- [ ] Review MySQL error log

### Issue: Still Slow After Optimization

**Symptoms:**
- Portal still takes > 2 seconds to load
- API calls still slow

**Solutions:**
- [ ] Verify indexes were created (SHOW INDEX)
- [ ] Clear all caches (browser, PHP, MySQL)
- [ ] Check database size (SELECT COUNT(*))
- [ ] Monitor slow query log
- [ ] Check server resources

### Issue: Errors in Console

**Symptoms:**
- JavaScript errors in browser console
- API errors

**Solutions:**
- [ ] Check browser console for details
- [ ] Verify API endpoints are responding
- [ ] Check network tab for failed requests
- [ ] Review backend error logs

## Success Criteria

✅ **Optimization is successful if:**

- [ ] Portal loads in < 2 seconds (was 5-8s)
- [ ] Mentor list loads in < 1 second (was 3-5s)
- [ ] Job posts load in < 1 second (was 2-4s)
- [ ] Requests load in < 1 second (was 2-3s)
- [ ] All features work correctly
- [ ] No errors in console or logs
- [ ] Database queries are fast
- [ ] Server resources are normal

## Notes

**Date Deployed:** _______________

**Deployed By:** _______________

**Performance Results:**
- Portal load time: _____ seconds
- Mentor list: _____ seconds
- Job posts: _____ seconds
- Requests: _____ seconds

**Issues Encountered:**
_________________________________
_________________________________
_________________________________

**Resolution:**
_________________________________
_________________________________
_________________________________

---

**Reference Documents:**
- `PERFORMANCE_FIX_QUICKSTART.md` - Quick start guide
- `PERFORMANCE_OPTIMIZATION.md` - Detailed technical guide
- `PERFORMANCE_VISUAL_GUIDE.md` - Visual comparison
- `PERFORMANCE_CHANGES_SUMMARY.md` - Complete summary
