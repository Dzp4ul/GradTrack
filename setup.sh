#!/bin/bash

echo "========================================"
echo "GradTrack Environment Setup"
echo "========================================"
echo ""

echo "[1/4] Setting up Backend..."
cd backend
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️  Please update backend/.env with your database credentials"
else
    echo "✓ .env already exists"
fi

echo ""
echo "[2/4] Installing Backend Dependencies..."
composer install
if [ $? -ne 0 ]; then
    echo "❌ Error: Composer install failed"
    exit 1
fi

cd ..

echo ""
echo "[3/4] Setting up Frontend..."
cd frontend
if [ ! -f .env.development ]; then
    echo "Creating .env.development from .env.example..."
    cp .env.example .env.development
    echo "⚠️  Please update frontend/.env.development with your backend URL"
else
    echo "✓ .env.development already exists"
fi

echo ""
echo "[4/4] Installing Frontend Dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ Error: npm install failed"
    exit 1
fi

cd ..

echo ""
echo "========================================"
echo "✅ Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Update backend/.env with your database credentials"
echo "2. Update frontend/.env.development with your backend URL"
echo "3. Start backend: cd backend && php -S localhost:8000"
echo "4. Start frontend: cd frontend && npm run dev"
echo ""
echo "For deployment instructions, see README.md"
echo ""
