package database

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/lib/pq"

	"kingdom-conquest/backend/internal/models"
)

var DB *sql.DB

// ErrUserExists is returned by CreateUser when the username or email is
// already taken (Postgres unique-constraint violation 23505).
var ErrUserExists = errors.New("username or email already exists")

// InitDB initializes the database connection
func InitDB() error {
	host := os.Getenv("DB_HOST")
	if host == "" {
		host = "localhost"
	}

	port := os.Getenv("DB_PORT")
	if port == "" {
		port = "5432"
	}

	user := os.Getenv("DB_USER")
	if user == "" {
		user = "postgres"
	}

	password := os.Getenv("DB_PASSWORD")
	if password == "" {
		password = "postgres"
	}

	dbname := os.Getenv("DB_NAME")
	if dbname == "" {
		dbname = "kingdom_conquest"
	}

	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, password, dbname)

	var err error
	DB, err = sql.Open("postgres", connStr)
	if err != nil {
		return fmt.Errorf("error opening database: %v", err)
	}

	if err := DB.Ping(); err != nil {
		return fmt.Errorf("error connecting to database: %v", err)
	}

	log.Println("Successfully connected to database")
	return nil
}

// CloseDB closes the database connection
func CloseDB() {
	if DB != nil {
		DB.Close()
	}
}

// InitSchema creates the database tables
func InitSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id SERIAL PRIMARY KEY,
		username VARCHAR(100) UNIQUE NOT NULL,
		password VARCHAR(255) NOT NULL,
		email VARCHAR(255) UNIQUE NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
		last_login TIMESTAMP WITH TIME ZONE,
		is_active BOOLEAN DEFAULT true
	);

	CREATE TABLE IF NOT EXISTS eras (
		id SERIAL PRIMARY KEY,
		name VARCHAR(100) UNIQUE NOT NULL,
		description TEXT,
		start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
		end_date TIMESTAMP WITH TIME ZONE,
		is_active BOOLEAN DEFAULT true,
		tick_count BIGINT DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS countries (
		id SERIAL PRIMARY KEY,
		name VARCHAR(255) NOT NULL,
		code VARCHAR(10) NOT NULL,
		color VARCHAR(7) NOT NULL,
		owner_id INTEGER REFERENCES users(id),
		parent_id INTEGER REFERENCES countries(id),
		population BIGINT DEFAULT 1000,
		resources BIGINT DEFAULT 100,
		territory_type VARCHAR(50) DEFAULT 'kingdom',
		era VARCHAR(50) DEFAULT 'medieval',
		created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS player_countries (
		id SERIAL PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id),
		country_id INTEGER NOT NULL REFERENCES countries(id),
		assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
		is_active BOOLEAN DEFAULT true,
		last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, country_id)
	);

	CREATE TABLE IF NOT EXISTS game_states (
		id SERIAL PRIMARY KEY,
		tick BIGINT NOT NULL,
		timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
		data JSONB NOT NULL
	);

	CREATE TABLE IF NOT EXISTS game_actions (
		id SERIAL PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id),
		country_id INTEGER NOT NULL REFERENCES countries(id),
		action_type VARCHAR(50) NOT NULL,
		description TEXT,
		tick BIGINT NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_countries_owner ON countries(owner_id);
	CREATE INDEX IF NOT EXISTS idx_game_states_tick ON game_states(tick);
	CREATE INDEX IF NOT EXISTS idx_game_actions_tick ON game_actions(tick);

	INSERT INTO eras (name, description, is_active) 
	VALUES ('medieval', 'Medieval Europe - Kingdoms and Fiefdoms', true)
	ON CONFLICT (name) DO NOTHING;
	`

	_, err := DB.Exec(schema)
	if err != nil {
		return fmt.Errorf("error creating schema: %v", err)
	}

	log.Println("Database schema initialized successfully")
	return nil
}

// SeedInitialData populates the database with initial kingdoms
func SeedInitialData() error {
	var count int
	err := DB.QueryRow("SELECT COUNT(*) FROM countries WHERE era = 'medieval'").Scan(&count)
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	kingdoms := []struct {
		name       string
		code       string
		color      string
		population int64
		resources  int64
	}{
		{"England", "ENG", "#FF6B6B", 5000000, 500},
		{"France", "FRA", "#4ECDC4", 18000000, 800},
		{"Spain", "ESP", "#FFE66D", 8000000, 600},
		{"Portugal", "POR", "#95E1D3", 2000000, 300},
		{"Holy Roman Empire", "HRE", "#A8D8EA", 15000000, 900},
		{"Scotland", "SCO", "#FCBAD3", 500000, 200},
		{"Norway", "NOR", "#D4F0F0", 400000, 350},
		{"Sweden", "SWE", "#FFAAA5", 600000, 400},
		{"Poland", "POL", "#6BCB77", 3000000, 450},
		{"Byzantium", "BYZ", "#FFD93D", 8000000, 1000},
		{"Russia", "RUS", "#C7F9CC", 4000000, 500},
		{"Venice", "VEN", "#4D96FF", 800000, 600},
		{"Papal States", "PAP", "#FFAAA5", 1500000, 400},
		{"Aragon", "ARA", "#FF6B6B", 3000000, 450},
		{"Castile", "CAS", "#4ECDC4", 4000000, 500},
	}

	tx, err := DB.Begin()
	if err != nil {
		return err
	}

	stmt, err := tx.Prepare(`INSERT INTO countries (name, code, color, population, resources, territory_type, era) VALUES ($1, $2, $3, $4, $5, 'kingdom', 'medieval')`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	for _, k := range kingdoms {
		if _, err := stmt.Exec(k.name, k.code, k.color, k.population, k.resources); err != nil {
			tx.Rollback()
			return err
		}
	}

	log.Printf("Seeded %d medieval kingdoms", len(kingdoms))
	return tx.Commit()
}

func GetNextTick() (int64, error) {
	var tick int64
	err := DB.QueryRow("SELECT COALESCE(MAX(tick), 0) + 1 FROM game_states").Scan(&tick)
	return tick, err
}

func SaveGameState(tick int64, data string) error {
	_, err := DB.Exec("INSERT INTO game_states (tick, data) VALUES ($1, $2)", tick, data)
	return err
}

func GetUserByUsername(username string) (*struct {
	ID, Population            int64
	Username, Password, Email string
	IsActive                  bool
}, error) {
	user := &struct {
		ID, Population            int64
		Username, Password, Email string
		IsActive                  bool
	}{}
	err := DB.QueryRow("SELECT id, username, password, email, is_active FROM users WHERE username = $1", username).
		Scan(&user.ID, &user.Username, &user.Password, &user.Email, &user.IsActive)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return user, nil
}

func CreateUser(username, password, email string) (int64, error) {
	var id int64
	err := DB.QueryRow("INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id",
		username, password, email).Scan(&id)
	if err != nil {
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && pqErr.Code == "23505" {
			return 0, ErrUserExists
		}
		return 0, err
	}
	return id, nil
}

func GetCountries(era string) ([]models.Country, error) {
	// LEFT JOIN through player_countries -> users so each country carries the
	// owning player's username (NULL when unclaimed). The scalar subquery with
	// LIMIT 1 guards against a hypothetical duplicate active claim producing
	// duplicate country rows.
	rows, err := DB.Query(`SELECT
		c.id, c.name, c.code, c.color, c.owner_id,
		(SELECT u.username
		   FROM player_countries pc
		   JOIN users u ON u.id = pc.user_id
		  WHERE pc.country_id = c.id AND pc.is_active = true
		  LIMIT 1) AS owner_name,
		c.population, c.resources, c.territory_type
		FROM countries c
		WHERE c.era = $1`, era)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var countries []models.Country
	for rows.Next() {
		var c models.Country
		var ownerID, ownerName sql.NullString
		if err := rows.Scan(&c.ID, &c.Name, &c.Code, &c.Color, &ownerID, &ownerName, &c.Population, &c.Resources, &c.TerritoryType); err != nil {
			return nil, err
		}
		if ownerID.Valid {
			oid, perr := strconv.ParseInt(ownerID.String, 10, 64)
			if perr == nil {
				c.OwnerID = &oid
			}
		}
		if ownerName.Valid {
			c.OwnerName = &ownerName.String
		}
		countries = append(countries, c)
	}
	return countries, rows.Err()
}

func ClaimCountry(userID, countryID int64) error {
	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var taken int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM player_countries WHERE country_id = $1 AND is_active = true`, countryID).Scan(&taken); err != nil {
		return err
	}
	if taken > 0 {
		return errors.New("country is already claimed")
	}

	var owned int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM player_countries WHERE user_id = $1 AND is_active = true`, userID).Scan(&owned); err != nil {
		return err
	}
	if owned > 0 {
		return errors.New("player already owns a kingdom")
	}

	if _, err := tx.Exec(`INSERT INTO player_countries (user_id, country_id, last_active) VALUES ($1, $2, current_timestamp)
		ON CONFLICT (user_id, country_id) DO UPDATE SET is_active = true, last_active = current_timestamp`,
		userID, countryID); err != nil {
		return err
	}
	if _, err := tx.Exec("UPDATE countries SET owner_id = $1 WHERE id = $2", userID, countryID); err != nil {
		return err
	}
	return tx.Commit()
}

func GetPlayerCountry(userID int64) (*models.PlayerCountry, error) {
	var pc models.PlayerCountry
	err := DB.QueryRow(`SELECT pc.id, pc.user_id, pc.country_id, c.name, pc.assigned_at, pc.is_active, pc.last_active FROM player_countries pc
		JOIN countries c ON pc.country_id = c.id
		WHERE pc.user_id = $1 AND pc.is_active = true`, userID).Scan(&pc.ID, &pc.UserID, &pc.CountryID, &pc.Name, &pc.AssignedAt, &pc.IsActive, &pc.LastActive)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &pc, nil
}

func UpdatePlayerActivity(userID int64) error {
	_, err := DB.Exec("UPDATE player_countries SET last_active = $1 WHERE user_id = $2", time.Now(), userID)
	return err
}

func UpdateUserLastLogin(userID int64) error {
	_, err := DB.Exec("UPDATE users SET last_login = $1 WHERE id = $2", time.Now(), userID)
	return err
}

// stalePlayerRow holds a player whose territory should be forfeited.
type stalePlayerRow struct {
	UserID      int64
	Username    string
	CountryID   int64
	CountryCode string
}

// GetStalePlayers returns players whose last activity (heartbeat or login)
// predates cutoff, i.e. they have not connected in over 7 days.
func GetStalePlayers(cutoff time.Time) ([]stalePlayerRow, error) {
	rows, err := DB.Query(
		`SELECT pc.user_id, u.username, pc.country_id, c.code
		 FROM player_countries pc
		 JOIN users u ON u.id = pc.user_id
		 JOIN countries c ON c.id = pc.country_id
		 WHERE pc.is_active = true
		   AND (pc.last_active < $1 OR u.last_login < $1)`, cutoff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []stalePlayerRow
	for rows.Next() {
		var r stalePlayerRow
		if err := rows.Scan(&r.UserID, &r.Username, &r.CountryID, &r.CountryCode); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// SetCountryOwnerToNull removes ownership of a kingdom (used when
// confiscating a lapsed player's territory).
func SetCountryOwnerToNull(countryID int64) error {
	_, err := DB.Exec("UPDATE countries SET owner_id = NULL WHERE id = $1", countryID)
	return err
}

// MarkPlayerCountryInactive records that a player's kingdom is forfeit.
func MarkPlayerCountryInactive(userID, countryID int64) error {
	_, err := DB.Exec(
		"UPDATE player_countries SET is_active = false WHERE user_id = $1 AND country_id = $2",
		userID, countryID)
	return err
}

// LogAction records an action in the audit table.
func LogAction(userID, countryID int64, actionType, description string) error {
	return DB.QueryRow(
		`INSERT INTO game_actions (user_id, country_id, action_type, description, tick)
		 VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(tick), 0) + 1 FROM game_states))`,
		userID, countryID, actionType, description).Err()
}

// UpdateCountryResources sets the resource total for a kingdom.
func UpdateCountryResources(countryID int64, resources int64) error {
	_, err := DB.Exec("UPDATE countries SET resources = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", resources, countryID)
	return err
}

// UpdateCountryPopulation sets the population for a kingdom.
func UpdateCountryPopulation(countryID int64, population int64) error {
	_, err := DB.Exec("UPDATE countries SET population = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", population, countryID)
	return err
}

// ActivePlayerRow describes a player currently holding a kingdom.
type ActivePlayerRow struct {
	UserID     int64
	Username   string
	CountryID  int64
	LastActive time.Time
}

// GetActivePlayers returns every player with an active kingdom.
func GetActivePlayers() ([]ActivePlayerRow, error) {
	rows, err := DB.Query(
		`SELECT pc.user_id, u.username, pc.country_id, pc.last_active
		 FROM player_countries pc
		 JOIN users u ON u.id = pc.user_id
		 WHERE pc.is_active = true
		 ORDER BY pc.last_active DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []ActivePlayerRow
	for rows.Next() {
		var r ActivePlayerRow
		if err := rows.Scan(&r.UserID, &r.Username, &r.CountryID, &r.LastActive); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// ActionRow describes one logged game action.
type ActionRow struct {
	UserID      int64
	CountryID   int64
	ActionType  string
	Description string
}

// GetRecentActions returns the most recent actions, newest first.
func GetRecentActions(limit int) ([]ActionRow, error) {
	rows, err := DB.Query(
		`SELECT user_id, country_id, action_type, description
		 FROM game_actions
		 ORDER BY id DESC
		 LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []ActionRow
	for rows.Next() {
		var r ActionRow
		if err := rows.Scan(&r.UserID, &r.CountryID, &r.ActionType, &r.Description); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}
