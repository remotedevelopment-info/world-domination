# Quick Start Guide

## Option 1: Docker Compose (Easiest)

```bash
# Clone and start
git clone <repository-url>
cd kingdom-conquest
docker-compose up -d

# Note: on this machine the host ports are remapped because
# 8080 and 5432 are already used by other projects:
#   backend  -> http://localhost:8081
#   postgres -> localhost:5433

# Open browser
open http://localhost:8081

# View logs
docker-compose logs -f backend

# Stop when done
docker-compose down
```

## Option 2: Manual Setup

### 1. Install Prerequisites
- Go 1.21+: https://golang.org/dl/
- PostgreSQL 15+: https://www.postgresql.org/download/

### 2. Setup Database
```bash
createdb kingdom_conquest
# Or: psql -U postgres -c "CREATE DATABASE kingdom_conquest;"
```

### 3. Run Backend
```bash
cd backend

# Set environment
export DB_HOST=localhost
export DB_PASSWORD=postgres

# Download deps and run
go mod download
go run cmd/server/main.go
```

### 4. Open Frontend
Navigate to http://localhost:8080 in your browser

## First Time Playing

1. **Register** - Create an account with username/email/password
2. **Login** - Sign in with your credentials
3. **Claim Kingdom** - Click on an unclaimed kingdom (white border) on the map
4. **Take Actions** - Use diplomacy, economy, or military actions (placeholders for now)
5. **Stay Active** - Log in daily to keep your kingdom!

## Game Mechanics

- **Tick System**: Game updates every 90 seconds
- **Activity**: Daily login required to maintain territory
- **Objective**: Expand through diplomacy, economics, and politics
- **Map**: Medieval Europe with 15 kingdoms

## API Testing

```bash
# Register
curl -X POST http://localhost:8081/api/register \
  -H "Content-Type: application/json" \
  -d '{"username":"player1","email":"p1@test.com","password":"secret"}'

# Login
curl -X POST http://localhost:8081/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"player1","password":"secret"}'

# Get Countries
curl http://localhost:8081/api/countries?era=medieval

# Claim Kingdom (replace TOKEN and COUNTRY_ID)
curl -X POST "http://localhost:8081/api/assign-country?country_id=1" \
  -H "Authorization: Bearer TOKEN"
```

## Troubleshooting

### Database Connection Error
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Restart if needed (Docker)
docker-compose restart postgres
```

### Port Already in Use
```bash
# Change port
export PORT=8081
go run cmd/server/main.go -port 8081
```

### WebSocket Not Connecting
- Ensure your browser allows WebSocket connections
- Check firewall settings
- Verify backend is running

## Next Steps

The foundation is complete! Here's what to build next:

1. **Action System** - Implement real diplomacy/economy/military actions
2. **Combat System** - Territory conquest mechanics
3. **Chat** - Player communication
4. **More Eras** - Ancient, Renaissance, Modern maps
5. **States/Regions** - Subdivide large countries
6. **Leaderboards** - Track top players
7. **Mobile App** - React Native version

Happy conquering! 🏰⚔️
