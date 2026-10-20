package game

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"kingdom-conquest/backend/internal/database"
)

// GameState is the authoritative world snapshot broadcast to clients.
// It is rebuilt on every state mutation and pushed to connected clients in
// real time — there is no 90-second polling tick.
type GameState struct {
	Tick      int64          `json:"tick"`
	Timestamp time.Time      `json:"timestamp"`
	Countries []CountryState `json:"countries"`
	Players   []PlayerState  `json:"players"`
	Actions   []ActionRecord `json:"actions"`
}

type CountryState struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	Code          string `json:"code"`
	Color         string `json:"color"`
	OwnerID       *int64 `json:"owner_id"`
	Population    int64  `json:"population"`
	Resources     int64  `json:"resources"`
	TerritoryType string `json:"territory_type"`
}

type PlayerState struct {
	UserID     int64     `json:"user_id"`
	Username   string    `json:"username"`
	CountryID  int64     `json:"country_id"`
	LastActive time.Time `json:"last_active"`
}

type ActionRecord struct {
	UserID      int64  `json:"user_id"`
	CountryID   int64  `json:"country_id"`
	ActionType  string `json:"action_type"`
	Description string `json:"description"`
}

type GameEngine struct {
	mu          sync.RWMutex
	currentTick int64
	subscribers map[chan GameState]struct{}
	isRunning   bool
}

var engine *GameEngine
var once sync.Once

func GetEngine() *GameEngine {
	once.Do(func() {
		engine = &GameEngine{
			subscribers: make(map[chan GameState]struct{}),
		}
	})
	return engine
}

func (g *GameEngine) Start() {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.isRunning {
		return
	}
	g.isRunning = true
	log.Println("Game engine started (real-time, event-driven)")
}

func (g *GameEngine) Stop() {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.isRunning = false
	log.Println("Game engine stopped")
}

// Resume sets the action-sequence counter, called at startup so ticks stay
// monotonic across restarts (next tick = last persisted snapshot + 1).
func (g *GameEngine) Resume(tick int64) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.currentTick = tick
}

// Advance performs one world mutation: it advances the action sequence
// counter, rebuilds the authoritative state from PostgreSQL, persists a
// snapshot, and immediately pushes it to every connected client. Callers
// invoke it after any mutation that changes the world.
func (g *GameEngine) Advance() GameState {
	g.mu.Lock()
	g.currentTick++
	tick := g.currentTick
	g.mu.Unlock()

	state := g.BuildState()
	if err := database.SaveGameState(tick, state.JSON()); err != nil {
		log.Printf("Error saving game state snapshot: %v", err)
	}

	if g.ProcessInactivePlayers() {
		state = g.BuildState()
	}
	g.Notify(state)
	return state
}

// BuildState rebuilds the canonical world from PostgreSQL. It is called by
// Advance after every mutation and can also be called on demand.
func (g *GameEngine) BuildState() GameState {
	countries, err := database.GetCountries("medieval")
	if err != nil {
		log.Printf("Error getting countries: %v", err)
	}

	var countryStates []CountryState
	for _, c := range countries {
		cs := CountryState{
			ID:            c.ID,
			Name:          c.Name,
			Code:          c.Code,
			Color:         c.Color,
			Population:    c.Population,
			Resources:     c.Resources,
			TerritoryType: c.TerritoryType,
		}
		if c.OwnerID != nil {
			cs.OwnerID = c.OwnerID
		}
		countryStates = append(countryStates, cs)
	}

	players, err := database.GetActivePlayers()
	if err != nil {
		log.Printf("Error getting active players: %v", err)
	}
	var playerStates []PlayerState
	for _, p := range players {
		playerStates = append(playerStates, PlayerState{
			UserID:     p.UserID,
			Username:   p.Username,
			CountryID:  p.CountryID,
			LastActive: p.LastActive,
		})
	}

	actions, err := database.GetRecentActions(20)
	if err != nil {
		log.Printf("Error getting recent actions: %v", err)
	}
	var actionRecords []ActionRecord
	for _, a := range actions {
		actionRecords = append(actionRecords, ActionRecord{
			UserID:      a.UserID,
			CountryID:   a.CountryID,
			ActionType:  a.ActionType,
			Description: a.Description,
		})
	}

	return GameState{
		Tick:      g.GetCurrentTick(),
		Timestamp: time.Now(),
		Countries: countryStates,
		Players:   playerStates,
		Actions:   actionRecords,
	}
}

// ProcessInactivePlayers enforces the daily-activity rule: any player who
// has not been active (heartbeat/ping) in over 7 days loses their kingdom.
// It returns true if the world changed, signalling the caller must
// rebuild and re-broadcast the state.
func (g *GameEngine) ProcessInactivePlayers() bool {
	cutoff := time.Now().Add(-7 * 24 * time.Hour)
	rows, err := database.GetStalePlayers(cutoff)
	if err != nil {
		log.Printf("Error checking inactive players: %v", err)
		return false
	}
	changed := false
	for _, p := range rows {
		if err := database.SetCountryOwnerToNull(p.CountryID); err != nil {
			log.Printf("Error nulling owner for country %d: %v", p.CountryID, err)
			continue
		}
		if err := database.MarkPlayerCountryInactive(p.UserID, p.CountryID); err != nil {
			log.Printf("Error marking inactive for user %d: %v", p.UserID, err)
			continue
		}
		log.Printf("Player %s lost %s after 7 days of inactivity", p.Username, p.CountryCode)
		changed = true
	}
	return changed
}

// Notify pushes a freshly built state to every connected client.
func (g *GameEngine) Notify(state GameState) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	for ch := range g.subscribers {
		select {
		case ch <- state:
		default:
		}
	}
}

func (g *GameEngine) Subscribe() chan GameState {
	ch := make(chan GameState, 10)
	g.mu.Lock()
	g.subscribers[ch] = struct{}{}
	g.mu.Unlock()
	return ch
}

func (g *GameEngine) Unsubscribe(ch chan GameState) {
	g.mu.Lock()
	delete(g.subscribers, ch)
	close(ch)
	g.mu.Unlock()
}

func (g *GameEngine) GetCurrentTick() int64 {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.currentTick
}

func (s GameState) JSON() string {
	b, err := json.Marshal(s)
	if err != nil {
		return "{}"
	}
	return string(b)
}
