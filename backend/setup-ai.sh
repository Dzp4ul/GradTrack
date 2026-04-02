#!/bin/bash

# AI Analytics Setup Script for GradTrack
# This script helps configure the Groq API key for AI-powered analytics

echo "=========================================="
echo "GradTrack AI Analytics Setup"
echo "=========================================="
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "✅ .env file created"
    echo ""
fi

# Prompt for API key
echo "Please enter your Groq API key:"
echo "(Get one from: https://console.groq.com/)"
read -r GROQ_KEY

# Check if key is empty
if [ -z "$GROQ_KEY" ]; then
    echo "❌ No API key provided. Exiting..."
    exit 1
fi

# Check if GROQ_API_KEY already exists in .env
if grep -q "GROQ_API_KEY=" .env; then
    echo "Updating existing GROQ_API_KEY..."
    # Use different delimiters for sed to avoid issues with special characters
    sed -i.bak "s|GROQ_API_KEY=.*|GROQ_API_KEY=$GROQ_KEY|" .env
    rm .env.bak 2>/dev/null
else
    echo "Adding GROQ_API_KEY to .env..."
    echo "" >> .env
    echo "# AI Configuration" >> .env
    echo "GROQ_API_KEY=$GROQ_KEY" >> .env
fi

echo ""
echo "✅ AI Analytics configured successfully!"
echo ""
echo "Next steps:"
echo "1. Restart your web server (Apache/PHP)"
echo "2. Navigate to Reports & Analytics in the admin panel"
echo "3. View AI-generated insights in the Overview tab"
echo ""
echo "For more information, see: AI_ANALYTICS_SETUP.md"
echo "=========================================="
