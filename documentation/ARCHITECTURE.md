# GradTrack System Architecture

## Overview

GradTrack is a graduate tracking and survey management system built with a modern, cloud-native architecture designed for easy deployment and scalability.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         USERS                                │
│                    (Web Browsers)                            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ HTTPS
                         │
        ┌────────────────┴────────────────┐
        │                                  │
        │                                  │
┌───────▼────────┐              ┌─────────▼────────┐
│   AWS Amplify  │              │  AWS Elastic     │
│   (Frontend)   │─────────────▶│  Beanstalk       │
│                │   API Calls  │  (Backend)       │
│  React + Vite  │              │  PHP 8.1         │
└────────────────┘              └─────────┬────────┘
                                          │
                                          │ MySQL
                                          │
                                  ┌───────▼────────┐
                                  │   AWS RDS      │
                                  │   (Database)   │
                                  │   MySQL        │
                                  └────────────────┘
```

## Technology Stack

### Frontend
- **Framework**: React 18
- **Language**: TypeScript
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS
- **Routing**: React Router v7
- **Charts**: Recharts
- **Icons**: Lucide React

### Backend
- **Language**: PHP 8.1
- **Database Driver**: PDO (MySQL)
- **Dependency Manager**: Composer
- **Architecture**: RESTful API

### Database
- **Type**: MySQL 8.0
- **Hosting**: AWS RDS
- **Region**: ap-southeast-2 (Sydney)

### Infrastructure
- **Frontend Hosting**: AWS Amplify
- **Backend Hosting**: AWS Elastic Beanstalk
- **Database**: AWS RDS
- **Version Control**: Git
- **CI/CD**: GitHub Actions

## Project Structure

```
GradTrack/
├── frontend/                    # React frontend application
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── contexts/           # React contexts (Auth, etc.)
│   │   ├── pages/              # Page components
│   │   │   ├── admin/          # Admin dashboard pages
│   │   │   ├── HomePage.tsx
│   │   │   ├── SignIn.tsx
│   │   │   └── Survey.tsx
│   │   ├── lib/                # Utilities and helpers
│   │   ├── config/             # Configuration files
│   │   │   └── api.ts          # API endpoints configuration
│   │   ├── data/               # Static data
│   │   ├── App.tsx             # Main app component
│   │   └── main.tsx            # Entry point
│   ├── public/                 # Static assets
│   ├── .env.development        # Development environment variables
│   ├── .env.production         # Production environment variables
│   ├── vite.config.ts          # Vite configuration
│   ├── tailwind.config.js      # Tailwind CSS configuration
│   ├── package.json            # Frontend dependencies
│   └── amplify.yml             # AWS Amplify build configuration
│
├── backend/                     # PHP backend API
│   ├── api/
│   │   ├── auth/               # Authentication endpoints
│   │   │   ├── login.php
│   │   │   ├── logout.php
│   │   │   └── check.php
│   │   ├── config/             # Configuration
│   │   │   ├── database.php    # Database connection
│   │   │   └── cors.php        # CORS configuration
│   │   ├── graduates/          # Graduate management
│   │   ├── surveys/            # Survey management
│   │   ├── dashboard/          # Dashboard statistics
│   │   ├── reports/            # Reports generation
│   │   ├── announcements/      # Announcements
│   │   └── settings/           # Settings
│   ├── vendor/                 # Composer dependencies
│   ├── .ebextensions/          # Elastic Beanstalk configuration
│   │   └── 01_environment.config
│   ├── .env                    # Environment variables
│   ├── .env.example            # Environment template
│   ├── .htaccess               # Apache configuration
│   ├── composer.json           # PHP dependencies
│   ├── Dockerfile              # Docker configuration
│   └── deploy.sh               # Deployment script
│
├── database/                    # Database schemas and migrations
│   └── gradtrack_db.sql
│
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions CI/CD
│
├── docker-compose.yml          # Local development with Docker
├── package.json                # Root package.json for scripts
├── setup.sh                    # Unix setup script
├── setup.bat                   # Windows setup script
├── README.md                   # Main documentation
└── DEPLOYMENT_CHECKLIST.md     # Deployment guide
```

## Data Flow

### Authentication Flow
1. User enters credentials in frontend
2. Frontend sends POST request to `/api/auth/login.php`
3. Backend validates credentials against RDS database
4. Backend creates session and returns user data
5. Frontend stores auth state in React context
6. Protected routes check authentication status

### Survey Submission Flow
1. Graduate fills out survey form
2. Frontend validates input
3. Frontend sends POST request to `/api/surveys/index.php`
4. Backend validates and sanitizes data
5. Backend inserts data into RDS database
6. Backend returns success response
7. Frontend shows confirmation message

### Admin Dashboard Flow
1. Admin logs in
2. Frontend requests dashboard stats from `/api/dashboard/stats.php`
3. Backend queries RDS for aggregated data
4. Backend returns JSON response
5. Frontend renders charts and statistics

## Security Features

### Frontend
- Environment-based API URLs (no hardcoded endpoints)
- Protected routes with authentication checks
- HTTPS enforcement in production
- XSS protection via React's built-in escaping
- Input validation before API calls

### Backend
- Environment variables for sensitive data
- PDO prepared statements (SQL injection prevention)
- CORS configuration
- Session-based authentication
- Input sanitization
- Error handling without exposing internals
- Security headers (.htaccess)

### Database
- AWS RDS with encryption at rest
- VPC security groups
- Automated backups
- SSL/TLS connections
- Strong password policy

## Deployment Options

### Option 1: AWS (Recommended)
- **Frontend**: AWS Amplify
- **Backend**: AWS Elastic Beanstalk
- **Database**: AWS RDS (already configured)
- **Benefits**: Fully managed, auto-scaling, integrated monitoring

### Option 2: Vercel + AWS
- **Frontend**: Vercel
- **Backend**: AWS Elastic Beanstalk
- **Database**: AWS RDS
- **Benefits**: Fast frontend deployment, good DX

### Option 3: Docker + VPS
- **Frontend + Backend**: Docker containers on VPS
- **Database**: AWS RDS or self-hosted MySQL
- **Benefits**: Full control, cost-effective

### Option 4: Traditional Hosting
- **Frontend**: Static hosting (Netlify, GitHub Pages)
- **Backend**: Shared PHP hosting
- **Database**: Shared MySQL or AWS RDS
- **Benefits**: Simple, low cost

## Scalability Considerations

### Current Capacity
- **Frontend**: Unlimited (CDN-based)
- **Backend**: Single instance (can handle ~100 concurrent users)
- **Database**: db.t3.micro (suitable for small to medium load)

### Scaling Strategy
1. **Horizontal Scaling**: Add more Elastic Beanstalk instances
2. **Database Scaling**: Upgrade RDS instance or add read replicas
3. **Caching**: Add Redis/ElastiCache for session storage
4. **CDN**: Add CloudFront for static assets
5. **Load Balancing**: Elastic Beanstalk auto-scaling

## Monitoring and Logging

### Frontend (Amplify)
- Build logs
- Access logs
- Performance metrics
- Error tracking

### Backend (Elastic Beanstalk)
- Application logs
- Web server logs
- Health monitoring
- CloudWatch metrics

### Database (RDS)
- Performance Insights
- Query logs
- Slow query logs
- CloudWatch metrics

## Cost Estimation

### Monthly Costs (Approximate)
- **AWS Amplify**: $5-15 (depends on traffic)
- **Elastic Beanstalk**: $15-30 (t3.small instance)
- **RDS**: Already running (current cost)
- **Data Transfer**: $5-10
- **Total**: ~$25-55/month

### Cost Optimization
- Use t3.micro for low traffic
- Enable auto-scaling to scale down during off-hours
- Use CloudFront CDN to reduce data transfer costs
- Set up billing alerts

## Disaster Recovery

### Backup Strategy
- **Database**: Automated RDS snapshots (daily)
- **Code**: Git repository (GitHub)
- **Configuration**: Documented in .env.example files

### Recovery Time Objective (RTO)
- **Frontend**: < 10 minutes (redeploy from Git)
- **Backend**: < 15 minutes (redeploy from Git)
- **Database**: < 30 minutes (restore from snapshot)

### Recovery Point Objective (RPO)
- **Database**: < 24 hours (daily snapshots)
- **Code**: Real-time (Git)

## Future Enhancements

### Short Term
- [ ] Add Redis for session management
- [ ] Implement API rate limiting
- [ ] Add comprehensive logging
- [ ] Set up monitoring alerts

### Medium Term
- [ ] Implement GraphQL API
- [ ] Add real-time notifications (WebSockets)
- [ ] Implement file upload to S3
- [ ] Add email notifications (SES)

### Long Term
- [ ] Microservices architecture
- [ ] Multi-region deployment
- [ ] Advanced analytics with ML
- [ ] Mobile app (React Native)

## Development Workflow

### Local Development
1. Clone repository
2. Run `setup.sh` or `setup.bat`
3. Update environment variables
4. Start backend: `cd backend && php -S localhost:8000`
5. Start frontend: `cd frontend && npm run dev`

### Git Workflow
1. Create feature branch
2. Make changes
3. Test locally
4. Commit and push
5. Create pull request
6. Review and merge to main
7. Auto-deploy via GitHub Actions

### Testing Strategy
- **Frontend**: Manual testing + TypeScript type checking
- **Backend**: Manual API testing
- **Integration**: End-to-end testing in staging environment

## Support and Maintenance

### Regular Maintenance
- Weekly: Check logs and error rates
- Monthly: Update dependencies
- Quarterly: Security audit
- Annually: Architecture review

### Troubleshooting
- Check deployment logs in AWS console
- Review CloudWatch logs
- Test API endpoints directly
- Verify environment variables
- Check database connectivity

## Contact and Documentation

- **Main README**: `/README.md`
- **Frontend README**: `/frontend/README.md`
- **Backend README**: `/backend/README.md`
- **Deployment Guide**: `/DEPLOYMENT_CHECKLIST.md`
