package models

import (
	"time"
)

// User represents a player in the game
type User struct {
	ID               int64     `json:"id"`
	Username         string    `json:"username"`
	Password         string    `json:"-"` // Never send password in JSON
	Email            string    `json:"email"`
	BaseColor        string    `json:"base_color"`          // Player's base colour for owned territories
	HomeTerritoryID  *int64    `json:"home_territory_id"`   // FK to countries.id - the player's home kingdom
	CreatedAt        time.Time `json:"created_at"`
	LastLogin        time.Time `json:"last_login"`
	IsActive         bool      `json:"is_active"`
}

// Country represents a kingdom/territory on the map
type Country struct {
	ID            int64     `json:"id"`
	Name          string    `json:"name"`
	Code          string    `json:"code"`       // Short code like "USA", "FRA", etc.
	Color         string    `json:"color"`      // Hex color for display
	OwnerID       *int64    `json:"owner_id"`   // Null if unowned
	OwnerName     *string   `json:"owner_name"` // Username of the player who owns it, if any
	ParentID      *int64    `json:"parent_id"`  // For states within countries (e.g., California within USA)
	Population    int64     `json:"population"`
	Resources     int64     `json:"resources"`
	Troops        int64     `json:"troops"`     // Central troop count for this kingdom
	TroopsLevy    int64     `json:"troops_levy"`    // Conscript levies / raw militia
	TroopsRegular int64     `json:"troops_regular"` // Trained line regulars
	TroopsElite   int64     `json:"troops_elite"`   // Royal guard / veteran elites
	FortN         int64     `json:"fort_n"`         // North frontier fortification tier
	FortS         int64     `json:"fort_s"`         // South frontier fortification tier
	FortE         int64     `json:"fort_e"`         // East frontier fortification tier
	FortW         int64     `json:"fort_w"`         // West frontier fortification tier
	EconomyRate   int64     `json:"economy_rate"`  // Tax rate 0-100 set by the owning player
	Investment    int64     `json:"investment"`    // Future GDP multiplier (0-100 slider)
	SocialCosts   int64     `json:"social_costs"`  // Growth/wealth vs currency strength (0-100 slider)
	Markets       int64     `json:"markets"`       // Build level: boosts trade output
	Infrastructure int64    `json:"infrastructure"` // Build level: boosts productivity & growth
	LastTaxRevenue    int64 `json:"last_tax_revenue"`
	LastMarketIncome  int64 `json:"last_market_income"`
	LastMilitaryExp   int64 `json:"last_military_exp"`
	LastSocialExp     int64 `json:"last_social_exp"`
	LastInvestmentExp int64 `json:"last_investment_exp"`
	LastTotalExp      int64 `json:"last_total_exp"`
	LastBudgetBalance int64 `json:"last_budget_balance"`
	LastMigration     int64 `json:"last_migration"`
	EntrepreneurialPride float64 `json:"entrepreneurial_pride"` // Intangible commercial confidence 0-100%
	MilitaryDelayedCosts int64   `json:"military_delayed_costs"` // Lingering military commitments/pensions
	ColonialProgress     float64 `json:"colonial_progress"`     // In-flight capital gestation progress 0-100%
	ColonialYield        float64 `json:"colonial_yield"`        // Permanent compounded trade productivity yield
	ColonialFleets       int64   `json:"colonial_fleets"`       // Total commissioned / returned expedition fleets
	TerritoryType string    `json:"territory_type"` // kingdom, state, region, etc.
	Era           string    `json:"era"`            // medieval, modern, ancient, etc.
	CreatedAt     time.Time `json:"created_at"`
	Borders       string    `json:"borders"`
	IsIsland      bool      `json:"is_island"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// GameState represents the state of the game at a specific tick
type GameState struct {
	ID        int64     `json:"id"`
	GameDate  time.Time `json:"game_date"`
	Timestamp time.Time `json:"timestamp"`
	Data      string    `json:"data"` // JSON encoded game state snapshot
}

// PlayerCountry links players to their countries
type PlayerCountry struct {
	ID         int64     `json:"id"`
	UserID     int64     `json:"user_id"`
	CountryID  int64     `json:"country_id"`
	Name       string    `json:"name"`
	Code       string    `json:"code"`
	AssignedAt time.Time `json:"assigned_at"`
	IsActive   bool      `json:"is_active"`
	LastActive time.Time `json:"last_active"`
}

// GameAction represents an action taken by a player
type GameAction struct {
	ID              int64     `json:"id"`
	UserID          int64     `json:"user_id"`
	CountryID       int64     `json:"country_id"`
	ActionType      string    `json:"action_type"` // diplomacy, economic, military, political
	Description     string    `json:"description"`
	TargetCountryID *int64   `json:"target_country_id,omitempty"`
	Direction       string    `json:"direction,omitempty"`   // N, S, E, W, or 0-360 degrees
	Speed           string    `json:"speed,omitempty"`       // Slow, Fast
	MovementType    string    `json:"movement_type,omitempty"` // interior, target
	GameDate        time.Time `json:"game_date"`
	CreatedAt       time.Time `json:"created_at"`
}

// Era represents a game board/era configuration
type Era struct {
	ID          int64      `json:"id"`
	Name        string     `json:"name"` // medieval, ancient, modern, etc.
	Description string     `json:"description"`
	StartDate   time.Time  `json:"start_date"`
	EndDate     *time.Time `json:"end_date"`
	IsActive    bool       `json:"is_active"`
	TickCount   int64      `json:"tick_count"`
}
