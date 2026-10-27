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
		base_color VARCHAR(7) DEFAULT '#FF6B6B',
		home_territory_id INTEGER,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
		last_login TIMESTAMP WITH TIME ZONE,
		is_active BOOLEAN DEFAULT true
	);

	ALTER TABLE users ADD COLUMN IF NOT EXISTS base_color VARCHAR(7) DEFAULT '#FF6B6B';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS home_territory_id INTEGER;

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
		troops BIGINT DEFAULT 0,
		economy_rate INTEGER DEFAULT 50,
		territory_type VARCHAR(50) DEFAULT 'kingdom',
		era VARCHAR(50) DEFAULT 'medieval',
		is_island BOOLEAN DEFAULT false,
		borders JSONB DEFAULT '{"borders": []}'::jsonb,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
	);

	ALTER TABLE countries ADD COLUMN IF NOT EXISTS is_island BOOLEAN DEFAULT false;
	ALTER TABLE countries ADD COLUMN IF NOT EXISTS borders JSONB DEFAULT '{"borders": []}'::jsonb;
	ALTER TABLE countries ADD COLUMN IF NOT EXISTS troops BIGINT DEFAULT 0;
	ALTER TABLE countries ADD COLUMN IF NOT EXISTS economy_rate INTEGER DEFAULT 50;

	CREATE TABLE IF NOT EXISTS troop_movements (
		id SERIAL PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id),
		country_id INTEGER NOT NULL REFERENCES countries(id),
		from_side VARCHAR(10) NOT NULL,
		to_side VARCHAR(10) NOT NULL,
		troop_count INTEGER DEFAULT 1,
		speed VARCHAR(10) NOT NULL,
		start_tick BIGINT DEFAULT 0,
		end_tick BIGINT DEFAULT 0,
		status VARCHAR(20) DEFAULT 'transit',
		created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_troop_movements_user ON troop_movements(user_id, country_id);
	CREATE INDEX IF NOT EXISTS idx_troop_movements_status ON troop_movements(status);

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
		tick BIGINT DEFAULT 0,
		game_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
		timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
		data JSONB NOT NULL
	);

	ALTER TABLE game_states ADD COLUMN IF NOT EXISTS tick BIGINT DEFAULT 0;
	ALTER TABLE game_states ADD COLUMN IF NOT EXISTS game_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
	ALTER TABLE game_states ALTER COLUMN tick SET DEFAULT 0;

	CREATE TABLE IF NOT EXISTS game_actions (
		id SERIAL PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id),
		country_id INTEGER NOT NULL REFERENCES countries(id),
		action_type VARCHAR(50) NOT NULL,
		description TEXT,
		target_country_id INTEGER REFERENCES countries(id),
		direction VARCHAR(10),
		speed VARCHAR(10),
		movement_type VARCHAR(20),
		tick BIGINT DEFAULT 0,
		game_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
	);

	ALTER TABLE game_actions ADD COLUMN IF NOT EXISTS target_country_id INTEGER REFERENCES countries(id);
	ALTER TABLE game_actions ADD COLUMN IF NOT EXISTS direction VARCHAR(10);
	ALTER TABLE game_actions ADD COLUMN IF NOT EXISTS speed VARCHAR(10);
	ALTER TABLE game_actions ADD COLUMN IF NOT EXISTS movement_type VARCHAR(20);
	ALTER TABLE game_actions ADD COLUMN IF NOT EXISTS tick BIGINT DEFAULT 0;
	ALTER TABLE game_actions ADD COLUMN IF NOT EXISTS game_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
	ALTER TABLE game_actions ALTER COLUMN tick SET DEFAULT 0;

	CREATE INDEX IF NOT EXISTS idx_game_actions_target ON game_actions(target_country_id);

	CREATE TABLE IF NOT EXISTS troop_deployments (
		id SERIAL PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id),
		country_id INTEGER NOT NULL REFERENCES countries(id),
		border_side VARCHAR(10) NOT NULL,
		direction VARCHAR(10),
		speed VARCHAR(10),
		strength INTEGER DEFAULT 1,
		deployed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_troop_deployments_user_country ON troop_deployments(user_id, country_id);
	CREATE INDEX IF NOT EXISTS idx_troop_deployments_border ON troop_deployments(country_id, border_side);

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

// SeedInitialData populates the database with initial kingdoms and ensures
// border/island metadata and any missing kingdoms (such as IRL and ITA) exist.
func SeedInitialData() error {
	type kingdom struct {
		name        string
		code        string
		color       string
		population  int64
		resources   int64
		isIsland    bool
		bordersJSON string
	}

	kingdoms := []kingdom{
		{"England", "ENG", "#FF6B6B", 5000000, 500, false, `{"borders": ["SCO"]}`},
		{"Ireland", "IRL", "#FFD700", 3000000, 200, true, `{"borders": []}`},
		{"Scotland", "SCO", "#FCBAD3", 500000, 200, false, `{"borders": ["ENG"]}`},
		{"France", "FRA", "#4ECDC4", 18000000, 800, false, `{"borders": ["ESP", "ARA", "HRE", "ITA"]}`},
		{"Spain", "ESP", "#FFE66D", 8000000, 600, false, `{"borders": ["POR", "CAS", "ARA", "FRA"]}`},
		{"Portugal", "POR", "#95E1D3", 2000000, 300, false, `{"borders": ["ESP", "CAS"]}`},
		{"Castile", "CAS", "#F38181", 4000000, 500, false, `{"borders": ["POR", "ESP", "ARA"]}`},
		{"Aragon", "ARA", "#FFA07A", 3000000, 450, false, `{"borders": ["ESP", "CAS", "FRA"]}`},
		{"Holy Roman Empire", "HRE", "#A8D8EA", 15000000, 900, false, `{"borders": ["FRA", "ITA", "VEN", "POL"]}`},
		{"Italy", "ITA", "#98DDCA", 6000000, 700, false, `{"borders": ["FRA", "HRE", "VEN", "PAP"]}`},
		{"Venice", "VEN", "#4D96FF", 800000, 600, false, `{"borders": ["HRE", "ITA", "PAP"]}`},
		{"Papal States", "PAP", "#E4BAD4", 1500000, 400, false, `{"borders": ["ITA", "VEN"]}`},
		{"Norway", "NOR", "#D4F0F0", 400000, 350, false, `{"borders": ["SWE"]}`},
		{"Sweden", "SWE", "#FFAAA5", 600000, 400, false, `{"borders": ["NOR"]}`},
		{"Poland", "POL", "#6BCB77", 3000000, 450, false, `{"borders": ["HRE", "RUS"]}`},
		{"Russia", "RUS", "#C7F9CC", 4000000, 500, false, `{"borders": ["POL"]}`},
		{"Byzantium", "BYZ", "#FFD93D", 8000000, 1000, false, `{"borders": []}`},
	}

	tx, err := DB.Begin()
	if err != nil {
		return err
	}

	for _, k := range kingdoms {
		res, err := tx.Exec(
			`UPDATE countries SET color = $1, is_island = $2, borders = $3::jsonb WHERE code = $4 AND era = 'medieval'`,
			k.color, k.isIsland, k.bordersJSON, k.code,
		)
		if err != nil {
			tx.Rollback()
			return err
		}
		rowsAffected, err := res.RowsAffected()
		if err != nil {
			tx.Rollback()
			return err
		}
		if rowsAffected == 0 {
			if _, err := tx.Exec(
				`INSERT INTO countries (name, code, color, population, resources, territory_type, era, is_island, borders) VALUES ($1, $2, $3, $4, $5, 'kingdom', 'medieval', $6, $7::jsonb)`,
				k.name, k.code, k.color, k.population, k.resources, k.isIsland, k.bordersJSON,
			); err != nil {
				tx.Rollback()
				return err
			}
		}
	}

	log.Printf("Seeded/synced %d medieval kingdoms with border data", len(kingdoms))
	return tx.Commit()
}

func GetNextGameDate() (time.Time, error) {
	var gameDate time.Time
	err := DB.QueryRow("SELECT COALESCE(MAX(game_date), NOW()) FROM game_states").Scan(&gameDate)
	return gameDate, err
}

func SaveGameState(gameDate time.Time, data string) error {
	_, err := DB.Exec("INSERT INTO game_states (game_date, data) VALUES ($1, $2)", gameDate, data)
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

func CreateUser(username, password, email, baseColor string) (int64, error) {
	var id int64
	err := DB.QueryRow("INSERT INTO users (username, password, email, base_color) VALUES ($1, $2, $3, $4) RETURNING id",
		username, password, email, baseColor).Scan(&id)
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
		c.population, c.resources, c.troops, c.territory_type, c.borders, c.is_island
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
		if err := rows.Scan(&c.ID, &c.Name, &c.Code, &c.Color, &ownerID, &ownerName, &c.Population, &c.Resources, &c.Troops, &c.TerritoryType, &c.Borders, &c.IsIsland); err != nil {
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
func LogAction(userID, countryID int64, actionType, description string,
	targetCountryID *int64, direction, speed, movementType string) error {
	return DB.QueryRow(
		`INSERT INTO game_actions (user_id, country_id, action_type, description,
		             target_country_id, direction, speed, movement_type, game_date)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
		userID, countryID, actionType, description, targetCountryID, direction, speed, movementType).Err()
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

// GetTroops returns the central troop count and per-border deployment counts
// for a country.
func GetTroops(countryID int64) (central int64, borders map[string]int64, err error) {
	borders = map[string]int64{"N": 0, "S": 0, "E": 0, "W": 0}

	// Central troops stored on the countries row.
	err = DB.QueryRow(`SELECT troops FROM countries WHERE id = $1`, countryID).Scan(&central)
	if err != nil {
		return 0, nil, err
	}

	// Per-border deployment strengths from troop_deployments.
	rows, err := DB.Query(
		`SELECT border_side, COALESCE(SUM(strength), 0)
		 FROM troop_deployments
		 WHERE country_id = $1
		 GROUP BY border_side`, countryID)
	if err != nil {
		return 0, nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var side string
		var count int64
		if err := rows.Scan(&side, &count); err != nil {
			return 0, nil, err
		}
		borders[side] = count
	}
	return central, borders, rows.Err()
}

// KingdomDetailRow consolidates all data needed for the command center view.
type KingdomDetailRow struct {
	CountryID     int64
	Name          string
	Code          string
	Population    int64
	Resources     int64
	Troops        int64
	EconomyRate   int64
	OwnerID       *int64
	OwnerName     *string
	CentralTroops int64
	BorderTroops  map[string]int64
}

// GetKingdomDetail returns all command-center data for a country: basic info,
// central troop count, and per-border deployment counts.
func GetKingdomDetail(countryID int64) (*KingdomDetailRow, error) {
	var r KingdomDetailRow
	r.BorderTroops = map[string]int64{"N": 0, "S": 0, "E": 0, "W": 0}

	err := DB.QueryRow(
		`SELECT c.id, c.name, c.code, c.population, c.resources, c.troops, c.economy_rate,
		       c.owner_id, u.username
		 FROM countries c
		 LEFT JOIN player_countries pc ON pc.country_id = c.id AND pc.is_active = true
		 LEFT JOIN users u ON u.id = pc.user_id
		 WHERE c.id = $1`,
		countryID,
	).Scan(&r.CountryID, &r.Name, &r.Code, &r.Population, &r.Resources, &r.Troops, &r.EconomyRate,
		&r.OwnerID, &r.OwnerName)
	if err != nil {
		return nil, err
	}

	central, borders, err := GetTroops(countryID)
	if err != nil {
		return nil, err
	}
	r.CentralTroops = central
	r.BorderTroops = borders
	return &r, nil
}

// DiplomaticRelationRow describes the diplomatic status with one target country.
type DiplomaticRelationRow struct {
	TargetCountryID int64  `json:"target_country_id"`
	TargetName      string `json:"target_name"`
	ActionType      string `json:"action_type"`   // diplomacy
	Description     string `json:"description"`   // e.g. "sent envoy"
	GameDate        string `json:"game_date"`     // ISO timestamp
}

// GetDiplomaticRelations returns all diplomacy actions involving the given
// country (either as sender or target), grouped by target country.
func GetDiplomaticRelations(countryID int64) ([]DiplomaticRelationRow, error) {
	rows, err := DB.Query(
		`SELECT DISTINCT ON (target_country_id)
		       target_country_id,
		       tc.name AS target_name,
		       action_type,
		       description,
		       game_date::text
		 FROM game_actions ga
		 JOIN countries tc ON tc.id = ga.target_country_id
		 WHERE ga.action_type = 'diplomacy'
		   AND (ga.country_id = $1 OR ga.target_country_id = $1)
		   AND ga.target_country_id IS NOT NULL
		 ORDER BY target_country_id, ga.id DESC`,
		countryID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []DiplomaticRelationRow
	for rows.Next() {
		var r DiplomaticRelationRow
		if err := rows.Scan(&r.TargetCountryID, &r.TargetName, &r.ActionType,
			&r.Description, &r.GameDate); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// EconomyRateRow describes the economic rate setting for a country.
type EconomyRateRow struct {
	CountryID   int64 `json:"country_id"`
	EconomyRate int64 `json:"economy_rate"`
}

// GetEconomyRate returns the current economy_rate for a country.
func GetEconomyRate(countryID int64) (int64, error) {
	var rate int64
	err := DB.QueryRow(`SELECT economy_rate FROM countries WHERE id = $1`, countryID).Scan(&rate)
	return rate, err
}

// SetEconomyRate updates the economy_rate for a country.
func SetEconomyRate(countryID int64, rate int64) error {
	_, err := DB.Exec(`UPDATE countries SET economy_rate = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, rate, countryID)
	return err
}

// TroopMovementRow describes a troop movement in progress or completed.
type TroopMovementRow struct {
	ID          int64  `json:"id"`
	UserID      int64  `json:"user_id"`
	CountryID   int64  `json:"country_id"`
	FromSide    string `json:"from_side"`
	ToSide      string `json:"to_side"`
	TroopCount  int64  `json:"troop_count"`
	Speed       string `json:"speed"`
	StartTick   int64  `json:"start_tick"`
	EndTick     int64  `json:"end_tick"`
	Status      string `json:"status"`
	CreatedAt   string `json:"created_at"`
}

// CreateTroopMovement records a new troop movement from one side to another.
func CreateTroopMovement(userID, countryID int64, fromSide, toSide, speed string, troopCount int64, startTick, endTick int64) error {
	_, err := DB.Exec(
		`INSERT INTO troop_movements (user_id, country_id, from_side, to_side, troop_count, speed, start_tick, end_tick, status, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'transit', CURRENT_TIMESTAMP)`,
		userID, countryID, fromSide, toSide, troopCount, speed, startTick, endTick,
	)
	return err
}

// GetTroopMovements returns all troop movements for a country, optionally filtered by status.
func GetTroopMovements(countryID int64, status string) ([]TroopMovementRow, error) {
	var rows *sql.Rows
	var err error
	if status != "" {
		rows, err = DB.Query(
			`SELECT id, user_id, country_id, from_side, to_side, troop_count, speed, start_tick, end_tick, status, created_at::text
			 FROM troop_movements
			 WHERE country_id = $1 AND status = $2
			 ORDER BY created_at DESC`,
			countryID, status,
		)
	} else {
		rows, err = DB.Query(
			`SELECT id, user_id, country_id, from_side, to_side, troop_count, speed, start_tick, end_tick, status, created_at::text
			 FROM troop_movements
			 WHERE country_id = $1
			 ORDER BY created_at DESC`,
			countryID,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []TroopMovementRow
	for rows.Next() {
		var r TroopMovementRow
		if err := rows.Scan(&r.ID, &r.UserID, &r.CountryID, &r.FromSide, &r.ToSide, &r.TroopCount, &r.Speed, &r.StartTick, &r.EndTick, &r.Status, &r.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// UpdateTroopMovementStatus updates the status of a troop movement.
func UpdateTroopMovementStatus(movementID int64, status string) error {
	_, err := DB.Exec(`UPDATE troop_movements SET status = $1 WHERE id = $2`, status, movementID)
	return err
}

// UpdateCountryTroops sets the troop total for a kingdom.
func UpdateCountryTroops(countryID int64, troops int64) error {
	_, err := DB.Exec("UPDATE countries SET troops = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", troops, countryID)
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
	UserID         int64
	CountryID      int64
	ActionType     string
	Description    string
	TargetCountryID *int64
	Direction      string
	Speed          string
	MovementType   string
}

// GetRecentActions returns the most recent actions, newest first.
func GetRecentActions(limit int) ([]ActionRow, error) {
	rows, err := DB.Query(
		`SELECT user_id, country_id, action_type, description,
		       target_country_id, direction, speed, movement_type
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
		if err := rows.Scan(&r.UserID, &r.CountryID, &r.ActionType, &r.Description,
			&r.TargetCountryID, &r.Direction, &r.Speed, &r.MovementType); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}
