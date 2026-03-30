#!/bin/bash

# GradTrack Frontend Deployment Script

echo "🚀 Starting GradTrack Frontend Deployment..."

# Check if environment file exists
if [ ! -f .env.production ]; then
    echo "⚠️  .env.production not found. Creating from example..."
    cp .env.example .env.production
    echo "❗ Please update .env.production with your backend API URL"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Type check
echo "🔍 Running type check..."
npm run typecheck

# Lint
echo "🧹 Running linter..."
npm run lint

# Build
echo "🏗️  Building for production..."
npm run build

echo "✅ Build complete! Output in dist/"
echo ""
echo "📝 Deployment options:"
echo ""
echo "1. AWS Amplify Console:"
echo "   - Push to GitHub"
echo "   - Connect repo in Amplify Console"
echo "   - Set VITE_API_BASE_URL environment variable"
echo ""
echo "2. Vercel:"
echo "   vercel --prod"
echo ""
echo "3. Netlify:"
echo "   netlify deploy --prod --dir=dist"
echo ""
echo "4. Manual:"
echo "   Upload dist/ folder to your web server"
