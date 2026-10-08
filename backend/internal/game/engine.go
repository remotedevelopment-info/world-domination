package game

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"kingdom-conquest/backend/internal/database"
)

const TickDuration = 90 * time.Second

type GameState struct {
	Tick       int64              `json:"tick"`
	Timestamp  time.Time          `json:"timestamp"`
	Countries  []CountryState     `json:"countries"`
	Players    []PlayerState      `json:"players"`
	Actions    []ActionRecord     `json:"actions"`
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
	UserID      int64     `json:"user_id"`
	Username    string    `json:"username"`
	CountryID   int64     `json:"country_id"`
	LastActive  time.Time `json:"last_active"`
}

type ActionRecord struct {
	UserID      int64  `json:"user_id"`
	CountryID   int64  `json:"country_id"`
	ActionType  string `json:"action_type"`
	Description string `json:"description"`
}

type GameEngine struct {
	tickChan     chan struct{}
	stopChan     chan struct{}
	currentTick  int64
	subscribers  map[chan GameState]struct{}
	mu           sync.RWMutex
	isRunning    bool
}

var engine *GameEngine
var once sync.Once

func GetEngine() *GameEngine {
	once.Do(func() {
		engine = &GameEngine{
			tickChan:    make(chan struct{}, 1),
			stopChan:    make(chan struct{}),
			subscribers: make(map[chan GameState]struct{}),
		}
	})
	return engine
}

func (g *GameEngine) Start() {
	if g.isRunning {
		return
	}
	g.isRunning = true
	go g.runTickLoop()
	log.Println("Game engine started with 90-second ticks")
}

func (g *GameEngine) Stop() {
	close(g.stopChan)
	g.isRunning = false
	log.Println("Game engine stopped")
}

func (g *GameEngine) runTickLoop() {
	ticker := time.NewTicker(TickDuration)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			g.processTick()
		case <-g.stopChan:
			return
		}
	}
}

func (g *GameEngine) processTick() {
	g.mu.Lock()
	g.currentTick++
	tick := g.currentTick
	g.mu.Unlock()

	log.Printf("Processing tick %d", tick)

	state := g.buildGameState(tick)

	data, err := json.Marshal(state)
	if err != nil {
		log.Printf("Error marshaling game state: %v", err)
		return
	}

	if err := database.SaveGameState(tick, string(data)); err != nil {
		log.Printf("Error saving game state: %v", err)
	}

	g.notifySubscribers(state)
	g.processInactivePlayers()
}

func (g *GameEngine) buildGameState(tick int64) GameState {
	countries, err := database.GetCountries("medieval")
	if err != nil {
		log.Printf("Error getting countries: %v", err)
	}

	var countryStates []CountryState
	for _, c := range countries {
		cs := CountryState{
			ID:            int64(c["id"].(float64)),
			Name:          c["name"].(string),
			Code:          c["code"].(string),
			Color:         c["color"].(string),
			Population:    int64(c["population"].(float64)),
			Resources:     int64(c["resources"].(float64)),
			TerritoryType: c["territory_type"].(string),
		}
		if c["owner_id"] != nil {
			oid := int64(c["owner_id"].(float64))
			cs.OwnerID = &oid
		}
		countryStates = append(countryStates, cs)
	}

	return GameState{
		Tick:      tick,
		Timestamp: time.Now(),
		Countries: countryStates,
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

func (g *GameEngine) notifySubscribers(state GameState) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	for ch := range g.subscribers {
		select {
		case ch <- state:
		default:
		}
	}
}

func (g *GameEngine) processInactivePlayers() {
	// Players inactive for more than 7 days lose their territory
	// This is a placeholder for the actual logic
	log.Println("Processing inactive players...")
}

func (g *GameEngine) GetCurrentTick() int64 {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.currentTick
}

func (g *GameEngine) TriggerTick() {
	select {
	case g.tickChan <- struct{}{}:
	default:
	}
}