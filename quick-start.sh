#!/bin/bash

# Image Editor - Quick Start Script
# This script helps set up the local development environment

set -e

echo "🚀 Image Editor - Quick Start"
echo "=============================="
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version must be 18 or higher (current: $(node -v))"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "⚠️  Docker is not installed. You'll need to run PostgreSQL and Redis manually."
    SKIP_DOCKER=true
else
    echo "✅ Docker found"
fi

echo "✅ Node.js $(node -v) found"
echo ""

# Start Docker services
if [ "$SKIP_DOCKER" != "true" ]; then
    # Check if Docker daemon is running
    if ! docker info > /dev/null 2>&1; then
        echo "⚠️  Docker daemon is not running."
        echo "   Please start Docker Desktop and try again, or run PostgreSQL and Redis manually."
        echo ""
        echo "   To run manually:"
        echo "   - PostgreSQL: brew install postgresql@15 && brew services start postgresql@15"
        echo "   - Redis: brew install redis && brew services start redis"
        echo ""
        read -p "Continue without Docker? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
        SKIP_DOCKER=true
    fi
fi

if [ "$SKIP_DOCKER" != "true" ]; then
    echo "🐳 Starting PostgreSQL and Redis with Docker Compose..."
    docker-compose up -d
    
    echo "⏳ Waiting for services to be ready..."
    sleep 5
    
    echo "✅ PostgreSQL and Redis are running"
    echo ""
else
    echo "⚠️  Skipping Docker setup. Make sure PostgreSQL and Redis are running manually."
    echo ""
fi

# Backend setup
echo "🔧 Setting up backend..."
cd backend

if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit backend/.env with your configuration"
fi

if [ ! -d "node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    npm install
else
    echo "✅ Backend dependencies already installed"
fi

cd ..

# Frontend setup
echo ""
echo "🎨 Setting up frontend..."
cd frontend

if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
else
    echo "✅ Frontend dependencies already installed"
fi

cd ..

# Summary
echo ""
echo "✅ Setup complete!"
echo ""
echo "📚 Next steps:"
echo ""
echo "1. Start the backend:"
echo "   cd backend"
echo "   npm run dev"
echo "   (Backend will run on http://localhost:8080)"
echo ""
echo "2. In a new terminal, start the frontend:"
echo "   cd frontend"
echo "   npm run dev"
echo "   (Frontend will run on http://localhost:5173)"
echo ""
echo "3. Open http://localhost:5173 in your browser"
echo ""
echo "📖 For deployment to GCP, see docs/DEPLOYMENT.md"
echo ""
echo "🧪 To run tests:"
echo "   cd backend && npm test"
echo ""
