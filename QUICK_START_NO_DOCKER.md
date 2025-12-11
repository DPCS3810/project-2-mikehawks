# Quick Start (Without Docker)

If you don't have Docker running or prefer to run services manually, follow these steps:

## Prerequisites

- Node.js 18+ installed
- PostgreSQL 15+ installed
- Redis 7+ installed

## Installation

### 1. Install PostgreSQL and Redis (macOS)

```bash
# Using Homebrew
brew install postgresql@15 redis

# Start services
brew services start postgresql@15
brew services start redis
```

### 2. Create Database

```bash
# Connect to PostgreSQL
psql postgres

# Create database and user
CREATE DATABASE image_editor;
CREATE USER postgres WITH PASSWORD 'postgres';
GRANT ALL PRIVILEGES ON DATABASE image_editor TO postgres;
\q
```

### 3. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend (in a new terminal)
cd frontend
npm install
```

### 4. Configure Environment

```bash
# Backend
cd backend
cp .env.example .env

# Edit .env if needed (default values should work for local development)
```

### 5. Run the Application

```bash
# Terminal 1: Start backend
cd backend
npm run dev
# Backend runs on http://localhost:8080

# Terminal 2: Start frontend
cd frontend
npm run dev
# Frontend runs on http://localhost:5173
```

### 6. Open in Browser

Visit http://localhost:5173

## Troubleshooting

### PostgreSQL Connection Error

If you get "connection refused" errors:

```bash
# Check if PostgreSQL is running
brew services list

# Restart if needed
brew services restart postgresql@15
```

### Redis Connection Error

```bash
# Check if Redis is running
brew services list

# Restart if needed
brew services restart redis
```

### Port Already in Use

If port 8080 or 5173 is already in use:

```bash
# Backend: Edit backend/.env and change PORT
PORT=3000

# Frontend: It will automatically suggest an alternative port
```

## Testing

```bash
# Run unit tests
cd backend
npm test

# Check test coverage
npm run test:unit
```

## Next Steps

- See [README.md](../README.md) for full documentation
- See [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) for cloud deployment
