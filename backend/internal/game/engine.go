package game

import (
	"encoding/json"
	"log"
	"math"
	"sync"
	"time"

	"kingdom-conquest/backend/internal/database"
)

// GameState is the authoritative world snapshot broadcast to clients.
// It is rebuilt on every state mutation and pushed to connected clients in
// real time — there is no 90-second polling tick.
type GameState struct {
	Tick        int64          `json:"tick"`
	SimYear     float64        `json:"sim_year"`
	YearInt     int64          `json:"year_int"`
	EraID       string         `json:"era_id"`
	EraName     string         `json:"era_name"`
	ChronoScale string         `json:"chrono_scale"`
	IsPaused    bool           `json:"is_paused"`
	GameDate    time.Time      `json:"game_date"`
	Timestamp   time.Time      `json:"timestamp"`
	Countries   []CountryState `json:"countries"`
	Players     []PlayerState  `json:"players"`
	Actions     []ActionRecord `json:"actions"`
}

type CountryState struct {
	ID             int64        `json:"id"`
	Name           string       `json:"name"`
	Code           string       `json:"code"`
	Color          string       `json:"color"`
	OwnerID        *int64       `json:"owner_id"`
	OwnerName      *string      `json:"owner_name"` // Username of the player who owns it, if any
	Population     int64        `json:"population"`
	Resources      int64        `json:"resources"`
	Troops         int64        `json:"troops"`
	EconomyRate    int64        `json:"economy_rate"`
	Investment     int64        `json:"investment"`
	SocialCosts    int64        `json:"social_costs"`
	Markets        int64        `json:"markets"`
	Infrastructure int64        `json:"infrastructure"`
	TerritoryType  string       `json:"territory_type"`
	Borders        string       `json:"borders"`
	IsIsland       bool         `json:"is_island"`
	Economy        EconomyState `json:"economy"` // Derived dashboard, rebuilt every broadcast
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
	mu                 sync.RWMutex
	currentTick        int64
	subscribers        map[chan GameState]struct{}
	isRunning          bool
	simYear            float64
	chronoScale        string
	isPaused           bool
	lastTimelineUpdate time.Time
}

var engine *GameEngine
var once sync.Once

func GetEngine() *GameEngine {
	once.Do(func() {
		engine = &GameEngine{
			subscribers:        make(map[chan GameState]struct{}),
			simYear:            1500.0,
			chronoScale:        "1d",
			isPaused:           false,
			lastTimelineUpdate: time.Now(),
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
	g.lastTimelineUpdate = time.Now()
	log.Println("Game engine started (real-time, event-driven with authoritative timeline)")
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

// ResumeState restores tick and timeline state from a persisted snapshot.
func (g *GameEngine) ResumeState(tick int64, simYear float64, chronoScale string, isPaused bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if tick > 0 {
		g.currentTick = tick
	}
	if simYear >= 1500 {
		g.simYear = simYear
	}
	if chronoScale != "" {
		g.chronoScale = NormalizeChronoScale(chronoScale)
	}
	g.isPaused = isPaused
	g.lastTimelineUpdate = time.Now()
}

// SetSimYear explicitly sets the authoritative game year, advances tick,
// and immediately broadcasts the updated world state to all connected clients.
func (g *GameEngine) SetSimYear(year float64) GameState {
	g.mu.Lock()
	g.simYear = year
	g.lastTimelineUpdate = time.Now()
	g.currentTick++
	g.mu.Unlock()

	state := g.BuildState()
	if err := database.SaveGameState(time.Now(), state.JSON()); err != nil {
		log.Printf("Error saving game state snapshot on year set: %v", err)
	}
	g.Notify(state)
	return state
}

// SetChronoScale updates the real-time speed of the global game clock.
func (g *GameEngine) SetChronoScale(scale string) GameState {
	normScale := NormalizeChronoScale(scale)
	g.mu.Lock()
	g.chronoScale = normScale
	g.lastTimelineUpdate = time.Now()
	g.mu.Unlock()

	state := g.BuildState()
	g.Notify(state)
	return state
}

// SetTimelinePaused pauses or resumes the auto-advancement of the game clock.
func (g *GameEngine) SetTimelinePaused(paused bool) GameState {
	g.mu.Lock()
	g.isPaused = paused
	g.lastTimelineUpdate = time.Now()
	g.mu.Unlock()

	state := g.BuildState()
	g.Notify(state)
	return state
}

// GetTimeline returns current authoritative timeline parameters.
func (g *GameEngine) GetTimeline() (float64, int64, Era, string, bool) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	yearInt := int64(math.Floor(g.simYear))
	return g.simYear, yearInt, GetEraForYear(yearInt), g.chronoScale, g.isPaused
}

// TickTimeline advances the continuous timeline based on elapsed real-world time
// and the current ChronoScale. Returns true if integer year or era changed.
func (g *GameEngine) TickTimeline() bool {
	g.mu.Lock()
	if !g.isRunning || g.isPaused {
		g.lastTimelineUpdate = time.Now()
		g.mu.Unlock()
		return false
	}
	now := time.Now()
	elapsed := now.Sub(g.lastTimelineUpdate).Seconds()
	g.lastTimelineUpdate = now

	scaleSec, ok := ChronoScales[g.chronoScale]
	if !ok || scaleSec <= 0 {
		scaleSec = 86400.0
	}

	deltaYears := elapsed / scaleSec
	prevYearInt := int64(math.Floor(g.simYear))
	prevEra := GetEraForYear(prevYearInt)

	g.simYear += deltaYears
	newYearInt := int64(math.Floor(g.simYear))
	newEra := GetEraForYear(newYearInt)
	g.mu.Unlock()

	if newYearInt != prevYearInt || newEra.ID != prevEra.ID {
		state := g.BuildState()
		g.Notify(state)
		return true
	}
	return false
}

// Advance performs one world mutation: it advances the action sequence
// counter, rebuilds the authoritative state from PostgreSQL, persists a
// snapshot, and immediately pushes it to every connected client. Callers
// invoke it after any mutation that changes the world.
func (g *GameEngine) Advance() GameState {
	g.mu.Lock()
	g.currentTick++
	g.mu.Unlock()

	state := g.BuildState()
	if err := database.SaveGameState(time.Now(), state.JSON()); err != nil {
		log.Printf("Error saving game state snapshot: %v", err)
	}

	if g.ProcessInactivePlayers() {
		state = g.BuildState()
	}
	g.Notify(state)
	return state
}

// TickEconomy applies one economic cycle to every owned country: the
// treasury gains (or loses) the budget balance and population drifts with
// prosperity, then the new state is broadcast to all clients.
func (g *GameEngine) TickEconomy() {
	countries, err := database.GetCountries("medieval")
	if err != nil {
		log.Printf("Error getting countries for economy tick: %v", err)
		return
	}
	changed := false
	for _, c := range countries {
		if c.OwnerID == nil {
			continue // unclaimed kingdoms stagnate
		}
		econ := ComputeEconomy(c.Population, c.Resources, c.Troops, c.EconomyRate, c.Markets, c.Infrastructure, c.Investment, c.SocialCosts)
		newResources := c.Resources + econ.BudgetBalance
		if newResources < -10000 {
			newResources = -10000 // bounded debt
		}
		if newResources != c.Resources {
			if err := database.UpdateCountryResources(c.ID, newResources); err != nil {
				log.Printf("Error applying budget for country %d: %v", c.ID, err)
				continue
			}
			changed = true
		}
		newPopulation := c.Population + PopulationGrowth(c.Population, c.EconomyRate, c.Markets, c.Infrastructure, c.Investment, c.SocialCosts)
		if newPopulation != c.Population {
			if err := database.UpdateCountryPopulation(c.ID, newPopulation); err != nil {
				log.Printf("Error applying growth for country %d: %v", c.ID, err)
				continue
			}
			changed = true
		}
	}
	if changed {
		g.Advance()
	} else {
		g.mu.Lock()
		g.currentTick++
		g.mu.Unlock()
		g.Notify(g.BuildState())
	}
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
			ID:             c.ID,
			Name:           c.Name,
			Code:           c.Code,
			Color:          c.Color,
			Population:     c.Population,
			Resources:      c.Resources,
			Troops:         c.Troops,
			EconomyRate:    c.EconomyRate,
			Investment:     c.Investment,
			SocialCosts:    c.SocialCosts,
			Markets:        c.Markets,
			Infrastructure: c.Infrastructure,
			TerritoryType:  c.TerritoryType,
			Borders:        c.Borders,
			IsIsland:       c.IsIsland,
			Economy:        ComputeEconomy(c.Population, c.Resources, c.Troops, c.EconomyRate, c.Markets, c.Infrastructure, c.Investment, c.SocialCosts),
		}
		if c.OwnerID != nil {
			cs.OwnerID = c.OwnerID
		}
		if c.OwnerName != nil {
			cs.OwnerName = c.OwnerName
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

	g.mu.RLock()
	tick := g.currentTick
	simYear := g.simYear
	chronoScale := g.chronoScale
	isPaused := g.isPaused
	g.mu.RUnlock()

	yearInt := int64(math.Floor(simYear))
	era := GetEraForYear(yearInt)

	return GameState{
		Tick:        tick,
		SimYear:     simYear,
		YearInt:     yearInt,
		EraID:       era.ID,
		EraName:     era.Name,
		ChronoScale: chronoScale,
		IsPaused:    isPaused,
		GameDate:    time.Now(),
		Timestamp:   time.Now(),
		Countries:   countryStates,
		Players:     playerStates,
		Actions:     actionRecords,
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
