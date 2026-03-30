#!/bin/bash

# GradTrack Backend Deployment Script

echo "🚀 Starting GradTrack Backend Deployment..."

# Check if EB CLI is installed
if ! command -v eb &> /dev/null
then
    echo "❌ EB CLI not found. Installing..."
    pip install awsebcli
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please create one from .env.example"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
composer install --no-dev --optimize-autoloader

# Initialize EB if not already done
if [ ! -d .elasticbeanstalk ]; then
    echo "🔧 Initializing Elastic Beanstalk..."
    eb init -p php-8.1 gradtrack-backend --region ap-southeast-2
fi

# Deploy
echo "🚀 Deploying to Elastic Beanstalk..."
eb deploy

# Get status
echo "✅ Deployment complete!"
eb status

echo ""
echo "📝 Next steps:"
echo "1. Set DB_PASSWORD: eb setenv DB_PASSWORD=your_password"
echo "2. Update CORS: eb setenv CORS_ALLOWED_ORIGINS=https://your-frontend.com"
echo "3. Get URL: eb open"
