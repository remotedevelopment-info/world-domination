package models

import (
	"time"
)

// User represents a player in the game
type User struct {
	ID        int64     `json:"id"`
	Username  string    `json:"username"`
	Password  string    `json:"-"` // Never send password in JSON
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
	LastLogin time.Time `json:"last_login"`
	IsActive  bool      `json:"is_active"`
}

// Country represents a kingdom/territory on the map
type Country struct {
	ID            int64     `json:"id"`
	Name          string    `json:"name"`
	Code          string    `json:"code"` // Short code like "USA", "FRA", etc.
	Color         string    `json:"color"` // Hex color for display
	OwnerID       *int64    `json:"owner_id"` // Null if unowned
	ParentID      *int64    `json:"parent_id"` // For states within countries (e.g., California within USA)
	Population    int64     `json:"population"`
	Resources     int64     `json:"resources"`
	TerritoryType string    `json:"territory_type"` // kingdom, state, region, etc.
	Era           string    `json:"era"` // medieval, modern, ancient, etc.
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// GameState represents the state of the game at a specific tick
type GameState struct {
	ID        int64     `json:"id"`
	Tick      int64     `json:"tick"`
	Timestamp time.Time `json:"timestamp"`
	Data      string    `json:"data"` // JSON encoded game state snapshot
}

// PlayerCountry links players to their countries
type PlayerCountry struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"user_id"`
	CountryID   int64     `json:"country_id"`
	AssignedAt  time.Time `json:"assigned_at"`
	IsActive    bool      `json:"is_active"`
	LastActive  time.Time `json:"last_active"`
}

// GameAction represents an action taken by a player
type GameAction struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"user_id"`
	CountryID   int64     `json:"country_id"`
	ActionType  string    `json:"action_type"` // diplomacy, economic, military, political
	Description string    `json:"description"`
	Tick        int64     `json:"tick"`
	CreatedAt   time.Time `json:"created_at"`
}

// Era represents a game board/era configuration
type Era struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"` // medieval, ancient, modern, etc.
	Description string    `json:"description"`
	StartDate   time.Time `json:"start_date"`
	EndDate     *time.Time `json:"end_date"`
	IsActive    bool      `json:"is_active"`
	TickCount   int64     `json:"tick_count"`
}
