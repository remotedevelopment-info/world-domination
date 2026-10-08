#!/bin/bash

# Kingdom Conquest Setup Script

set -e

echo "🏰 Kingdom Conquest - Setup Script"
echo "=================================="

# Check for Docker
if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
    echo "✓ Docker and Docker Compose found"
    echo ""
    echo "Starting with Docker Compose..."
    docker-compose up -d
    echo ""
    echo "✅ Setup complete!"
    echo "🌐 Game available at: http://localhost:8080"
    echo "📊 Database: localhost:5432"
    echo ""
    echo "View logs: docker-compose logs -f"
    echo "Stop: docker-compose down"
    exit 0
fi

# Manual setup
echo "⚠️  Docker not found. Proceeding with manual setup..."
echo ""

# Check for Go
if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed. Please install Go 1.21+"
    echo "   https://golang.org/dl/"
    exit 1
fi

echo "✓ Go found: $(go version)"

# Check for PostgreSQL
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed. Please install PostgreSQL 15+"
    exit 1
fi

echo "✓ PostgreSQL found"

# Create database
echo ""
echo "Creating database..."
createdb kingdom_conquest 2>/dev/null || echo "Database may already exist"

# Setup Go backend
echo ""
echo "Setting up Go backend..."
cd backend
go mod download
go build -o server ./cmd/server

echo ""
echo "✅ Backend built successfully!"
echo ""
echo "To start the server:"
echo "  export DB_HOST=localhost"
echo "  export DB_PORT=5432"
echo "  export DB_USER=postgres"
echo "  export DB_PASSWORD=postgres"
echo "  export DB_NAME=kingdom_conquest"
echo "  ./server -port 8080"
echo ""
echo "🌐 Game available at: http://localhost:8080"
