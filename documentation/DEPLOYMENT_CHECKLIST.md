# GradTrack Deployment Checklist

## Pre-Deployment

### Backend
- [ ] Update `.env` with production database credentials
- [ ] Test database connection to AWS RDS
- [ ] Remove any debug/test files from `api/` directory
- [ ] Run `composer install --no-dev --optimize-autoloader`
- [ ] Verify all API endpoints work locally
- [ ] Check PHP version compatibility (8.1+)

### Frontend
- [ ] Update `.env.production` with backend API URL
- [ ] Remove hardcoded credentials (DONE ✓)
- [ ] Test build locally: `npm run build`
- [ ] Run type check: `npm run typecheck`
- [ ] Run linter: `npm run lint`
- [ ] Test production build: `npm run preview`

### Database
- [ ] Backup current database
- [ ] Verify RDS security group allows backend access
- [ ] Test connection from local machine
- [ ] Document database schema

## Deployment Steps

### 1. Deploy Backend to AWS EC2

```bash
cd backend

# Install EB CLI
pip install awsebcli

# Initialize (first time only)
eb init -p php-8.1 gradtrack-backend --region ap-southeast-2

# Create environment (first time only)
eb create gradtrack-backend-prod

# Set sensitive environment variables
eb setenv DB_PASSWORD=your_actual_password

# Deploy
eb deploy

# Verify deployment
eb status
eb open
```

**Backend URL**: Copy this for frontend configuration

### 2. Deploy Frontend to AWS EC2 (Same Instance or Separate Instance)

```bash
# On your EC2 instance
cd /var/www/html/gradtrack/frontend

# Install dependencies and build
npm ci
npm run build

# Copy built files to Apache web root
sudo rm -rf /var/www/html/frontend
sudo mkdir -p /var/www/html/frontend
sudo cp -r dist/* /var/www/html/frontend/
```

If you are serving frontend and backend from the same EC2 Apache server, add this to your Apache vhost:

```apache
Alias /app /var/www/html/frontend

<Directory /var/www/html/frontend>
   Options -Indexes +FollowSymLinks
   AllowOverride None
   Require all granted

   # SPA fallback to index.html
   FallbackResource /app/index.html
</Directory>
```

Then restart Apache:

```bash
sudo apache2ctl configtest
sudo systemctl restart apache2
```

Set frontend environment before build:

```bash
# frontend/.env.production
VITE_API_BASE_URL=https://your-backend-domain.com
```

### 3. Deploy Frontend to AWS Amplify (Alternative)

#### Via Amplify Console (Recommended):
1. Push code to GitHub
2. Go to AWS Amplify Console
3. Click "New app" → "Host web app"
4. Connect GitHub repository
5. Configure:
   - Root directory: `frontend`
   - Build command: `npm run build`
   - Output directory: `dist`
6. Add environment variable:
   - `VITE_API_BASE_URL` = Backend URL from step 1
7. Deploy

#### Via Amplify CLI:
```bash
cd frontend

# Install CLI
npm install -g @aws-amplify/cli

# Initialize
amplify init

# Add hosting
amplify add hosting

# Publish
amplify publish
```

### 4. Configure CORS

Update backend to allow frontend domain:

```bash
cd backend
eb setenv CORS_ALLOWED_ORIGINS=https://your-amplify-app.amplifyapp.com
```

### 5. Test Production

- [ ] Test login functionality
- [ ] Test all API endpoints
- [ ] Test file uploads (if any)
- [ ] Test on different browsers
- [ ] Test on mobile devices
- [ ] Check console for errors
- [ ] Verify HTTPS is working

## Post-Deployment

### Security
- [ ] Enable HTTPS on both frontend and backend
- [ ] Update CORS to specific domains (remove wildcards)
- [ ] Enable AWS WAF for DDoS protection
- [ ] Set up AWS CloudWatch alarms
- [ ] Review IAM permissions
- [ ] Enable RDS encryption at rest
- [ ] Enable RDS automated backups

### Monitoring
- [ ] Set up CloudWatch logs for backend
- [ ] Set up Amplify monitoring for frontend
- [ ] Configure error alerting
- [ ] Set up uptime monitoring
- [ ] Monitor RDS performance

### Documentation
- [ ] Document backend API URL
- [ ] Document frontend URL
- [ ] Update README with production URLs
- [ ] Document deployment process
- [ ] Create runbook for common issues

## Rollback Plan

### Backend Rollback
```bash
cd backend
eb deploy --version <previous-version-label>
```

### Frontend Rollback
- Amplify Console: Click "Redeploy" on previous version
- Or: Revert Git commit and push

### Database Rollback
```bash
# Restore from RDS snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier gradtrackdb-restored \
  --db-snapshot-identifier <snapshot-id>
```

## Troubleshooting

### Backend Issues
- Check EB logs: `eb logs`
- Check RDS connectivity: Test from EB instance
- Verify environment variables: `eb printenv`

### Frontend Issues
- Check Amplify build logs in console
- Verify environment variables in Amplify settings
- Check browser console for CORS errors

### Database Issues
- Check RDS security groups
- Verify credentials
- Check RDS performance insights

## Cost Optimization

- [ ] Review Elastic Beanstalk instance size (start with t3.small)
- [ ] Enable RDS auto-scaling if needed
- [ ] Set up CloudWatch billing alarms
- [ ] Review Amplify bandwidth usage
- [ ] Consider CloudFront CDN for frontend

## Maintenance

### Weekly
- [ ] Check error logs
- [ ] Review performance metrics
- [ ] Check disk space

### Monthly
- [ ] Update dependencies
- [ ] Review security patches
- [ ] Backup database
- [ ] Review costs

### Quarterly
- [ ] Security audit
- [ ] Performance optimization
- [ ] Update documentation
