# Kingdom Conquest 🏰

A browser-based medieval strategy game built with Go backend and HTML Canvas frontend.

## Game Overview

Kingdom Conquest is a turn-based strategy MUD (Multi-User Dungeon) game where players:
- Claim a kingdom on a medieval European map
- Expand borders through diplomacy, economics, and military action
- Manage resources and population
- Compete with other players for territory

**Game Mechanics:**
- **90-second ticks**: Game state updates every 90 seconds
- **Daily activity required**: Players must connect daily to maintain territory
- **Multiple eras**: Start with Medieval, expand to other historical periods
- **Territory hierarchy**: Large countries split into states/regions

## Tech Stack

### Backend
- **Go 1.21** - Server-side logic
- **PostgreSQL** - Database for users, countries, and game state
- **Gorilla Mux** - HTTP routing
- **Gorilla WebSocket** - Real-time game state updates
- **Channels** - Concurrent game tick processing

### Frontend
- **HTML5 Canvas** - Interactive world map rendering
- **Vanilla JavaScript** - Game client logic
- **CSS3** - Responsive styling
- **WebSocket** - Real-time server communication

## Project Structure

```
kingdom-conquest/
├── backend/
│   ├── cmd/server/
│   │   └── main.go          # Application entry point
│   ├── internal/
│   │   ├── database/
│   │   │   └── database.go  # DB connection & queries
│   │   ├── game/
│   │   │   └── engine.go    # Game tick engine
│   │   ├── handlers/
│   │   │   └── handlers.go  # HTTP handlers
│   │   └── models/
│   │       └── models.go    # Data models
│   ├── pkg/auth/
│   │   └── auth.go          # Authentication
│   ├── go.mod
│   └── Dockerfile
├── frontend/
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── game.js
├── docker-compose.yml
└── README.md
```

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

The game will be available at http://localhost:8080

### Manual Setup

#### Prerequisites
- Go 1.21+
- PostgreSQL 15+
- Node.js (optional, for development)

#### Database Setup

```bash
# Create database
createdb kingdom_conquest

# Or using psql
psql -U postgres -c "CREATE DATABASE kingdom_conquest;"
```

#### Backend

```bash
cd backend

# Set environment variables
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=postgres
export DB_PASSWORD=postgres
export DB_NAME=kingdom_conquest
export PORT=8080

# Download dependencies
go mod download

# Run server
go run cmd/server/main.go
```

#### Frontend

The frontend is served statically by the Go backend. Open http://localhost:8080 in your browser.

## API Endpoints

### Authentication
- `POST /api/register` - Register new user
- `POST /api/login` - Login and get token
- `POST /api/logout` - Logout (requires auth)

### Game
- `GET /api/countries?era=medieval` - List available kingdoms
- `POST /api/assign-country?country_id=X` - Claim a kingdom (requires auth)
- `GET /api/my-country` - Get player's kingdom (requires auth)
- `POST /api/heartbeat` - Update activity timestamp (requires auth)

### WebSocket
- `WS /ws` - Real-time game state updates

## Database Schema

### Tables
- **users** - Player accounts
- **eras** - Game board configurations (medieval, modern, etc.)
- **countries** - Kingdoms/territories on the map
- **player_countries** - Player-kingdom assignments
- **game_states** - Historical game state snapshots (every tick)
- **game_actions** - Player action log

## Game Loop

1. Server starts game engine with 90-second tick interval
2. Each tick:
   - Collect current game state
   - Process inactive players (7+ days = lose territory)
   - Save state snapshot to database
   - Broadcast to connected WebSocket clients
3. Players connect via browser, claim kingdoms, take actions
4. Frontend renders map using HTML Canvas with kingdom polygons

## Medieval Kingdoms (Initial Era)

15 playable kingdoms including:
- England, France, Spain, Portugal
- Holy Roman Empire, Italy
- Scotland, Norway, Sweden, Poland
- Byzantium, Russia, Venice
- Papal States, Aragon, Castile

## Future Enhancements

- [ ] Diplomacy system (alliances, trade, war)
- [ ] Economic actions (taxes, building, trade)
- [ ] Military system (troops, movement, combat)
- [ ] Multiple eras (Ancient, Renaissance, Modern)
- [ ] State/region subdivision for large countries
- [ ] Chat system
- [ ] Leaderboards
- [ ] Mobile app (React Native)

## License

MIT License