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
		markets INTEGER DEFAULT 0,
		infrastructure INTEGER DEFAULT 0,
		investment INTEGER DEFAULT 0,
		social_costs INTEGER DEFAULT 0,
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
	ALTER TABLE countries ADD COLUMN IF NOT EXISTS markets INTEGER DEFAULT 0;
	ALTER TABLE countries ADD COLUMN IF NOT EXISTS infrastructure INTEGER DEFAULT 0;
	ALTER TABLE countries ADD COLUMN IF NOT EXISTS investment INTEGER DEFAULT 0;
	ALTER TABLE countries ADD COLUMN IF NOT EXISTS social_costs INTEGER DEFAULT 0;

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
		// Era I: The Age of Discovery (1500) — 11 Starting Sovereign Empires
		{"Crown of Spain", "ESP", "#D35400", 8500000, 750, false, `{"borders": ["POR", "FRA", "MAR", "ALG"], "birth_year": 1500, "unlock_era": "discovery", "parent": ""}`},
		{"Kingdom of Portugal", "POR", "#16A085", 2200000, 450, false, `{"borders": ["ESP", "MAR"], "birth_year": 1500, "unlock_era": "discovery", "parent": ""}`},
		{"Kingdom of France", "FRA", "#2980B9", 16000000, 850, false, `{"borders": ["ESP", "HRE", "ENG", "NED", "ITA", "ALG"], "birth_year": 1500, "unlock_era": "discovery", "parent": ""}`},
		{"Kingdom of England", "ENG", "#C0392B", 4500000, 600, true, `{"borders": ["FRA", "SCO", "IRL", "NED", "NOR"], "birth_year": 1500, "unlock_era": "discovery", "parent": ""}`},
		{"Holy Roman Empire", "HRE", "#D4AC0D", 14000000, 900, false, `{"borders": ["FRA", "VEN", "POL", "KAL", "NED", "PRU", "ITA", "AUT", "CZE"], "birth_year": 1500, "unlock_era": "discovery", "parent": ""}`},
		{"Ottoman Empire", "OTT", "#1B4F72", 12000000, 1000, false, `{"borders": ["VEN", "POL", "GRE", "ROM", "SRB", "EGY"], "birth_year": 1500, "unlock_era": "discovery", "parent": ""}`},
		{"Republic of Venice", "VEN", "#00A8FF", 1800000, 700, false, `{"borders": ["HRE", "OTT", "PAP", "ITA", "AUT", "SRB", "CRO", "GRE"], "birth_year": 1500, "unlock_era": "discovery", "parent": ""}`},
		{"Papal States", "PAP", "#A569BD", 1500000, 500, false, `{"borders": ["VEN", "ITA", "GRE", "TUN"], "birth_year": 1500, "unlock_era": "discovery", "parent": ""}`},
		{"Poland-Lithuania", "POL", "#8E44AD", 6500000, 650, false, `{"borders": ["HRE", "OTT", "RUS", "PRU", "AUT", "ROM", "HUN", "UKR", "BLT", "CZE"], "birth_year": 1500, "unlock_era": "discovery", "parent": ""}`},
		{"Tsardom of Muscovy", "RUS", "#795548", 5000000, 500, false, `{"borders": ["POL", "KAL", "SWE", "ROM", "FIN", "UKR", "BLT"], "birth_year": 1500, "unlock_era": "discovery", "parent": ""}`},
		{"Kalmar Union", "KAL", "#34495E", 2000000, 400, false, `{"borders": ["HRE", "RUS", "SWE", "PRU", "NOR"], "birth_year": 1500, "unlock_era": "discovery", "parent": ""}`},

		// Era II: The Age of Revolt (1750 – 1859) — 5 New Unowned Countries
		{"Kingdom of Scotland", "SCO", "#2E86C1", 1300000, 350, true, `{"borders": ["ENG", "IRL", "NOR"], "birth_year": 1750, "unlock_era": "revolt", "parent": "ENG"}`},
		{"Dutch Republic", "NED", "#E67E22", 2100000, 650, false, `{"borders": ["FRA", "HRE", "ENG"], "birth_year": 1750, "unlock_era": "revolt", "parent": "HRE"}`},
		{"Kingdom of Prussia", "PRU", "#2C3E50", 5400000, 700, false, `{"borders": ["HRE", "POL", "KAL", "SWE", "BLT", "CZE"], "birth_year": 1750, "unlock_era": "revolt", "parent": "HRE"}`},
		{"Kingdom of Sweden", "SWE", "#F1C40F", 2400000, 520, false, `{"borders": ["KAL", "NOR", "RUS", "PRU", "FIN", "BLT"], "birth_year": 1750, "unlock_era": "revolt", "parent": "KAL"}`},
		{"Hellenic Republic", "GRE", "#3498DB", 1600000, 420, false, `{"borders": ["OTT", "VEN", "PAP", "SRB", "EGY"], "birth_year": 1750, "unlock_era": "revolt", "parent": "OTT"}`},

		// Era III: The Age of Independence (1860 – 1919) — 5 New Unowned Countries
		{"Kingdom of Italy", "ITA", "#27AE60", 6200000, 680, false, `{"borders": ["FRA", "HRE", "VEN", "PAP", "AUT", "CRO", "TUN"], "birth_year": 1860, "unlock_era": "independence", "parent": "HRE"}`},
		{"Austria-Hungary", "AUT", "#B03A2E", 8200000, 780, false, `{"borders": ["HRE", "ITA", "VEN", "POL", "ROM", "SRB", "HUN", "CZE", "CRO"], "birth_year": 1860, "unlock_era": "independence", "parent": "HRE"}`},
		{"Kingdom of Romania", "ROM", "#F39C12", 4800000, 540, false, `{"borders": ["POL", "RUS", "OTT", "AUT", "SRB", "HUN", "UKR"], "birth_year": 1860, "unlock_era": "independence", "parent": "OTT"}`},
		{"Kingdom of Serbia", "SRB", "#922B21", 2600000, 440, false, `{"borders": ["OTT", "VEN", "AUT", "ROM", "GRE", "HUN", "CRO"], "birth_year": 1860, "unlock_era": "independence", "parent": "OTT"}`},
		{"Kingdom of Norway", "NOR", "#BA4A00", 1900000, 480, false, `{"borders": ["SWE", "KAL", "ENG", "SCO", "FIN"], "birth_year": 1860, "unlock_era": "independence", "parent": "KAL"}`},

		// Era IV: Age of Decolonisation (1920 – 1988) — 6 New Unowned Countries
		{"Republic of Ireland", "IRL", "#2ECC71", 2900000, 460, true, `{"borders": ["ENG", "SCO"], "birth_year": 1920, "unlock_era": "decolonisation", "parent": "ENG"}`},
		{"Republic of Finland", "FIN", "#5DADE2", 3100000, 510, false, `{"borders": ["SWE", "NOR", "RUS", "BLT"], "birth_year": 1920, "unlock_era": "decolonisation", "parent": "RUS"}`},
		{"Republic of Hungary", "HUN", "#1E8449", 4200000, 530, false, `{"borders": ["AUT", "POL", "ROM", "SRB", "CRO", "CZE", "UKR"], "birth_year": 1920, "unlock_era": "decolonisation", "parent": "AUT"}`},
		{"Republic of Egypt", "EGY", "#B7950B", 9500000, 690, false, `{"borders": ["OTT", "GRE"], "birth_year": 1920, "unlock_era": "decolonisation", "parent": "OTT"}`},
		{"Kingdom of Morocco", "MAR", "#A93226", 5200000, 520, false, `{"borders": ["ESP", "POR", "ALG"], "birth_year": 1920, "unlock_era": "decolonisation", "parent": "ESP"}`},
		{"Republic of Algeria", "ALG", "#229954", 6800000, 640, false, `{"borders": ["MAR", "ESP", "FRA", "TUN"], "birth_year": 1920, "unlock_era": "decolonisation", "parent": "FRA"}`},

		// Era V: The Modern Age (1989 – Present) — 5 New Unowned Countries
		{"Ukraine", "UKR", "#2874A6", 11000000, 760, false, `{"borders": ["RUS", "POL", "ROM", "HUN"], "birth_year": 1989, "unlock_era": "modern", "parent": "RUS"}`},
		{"Baltic Republics", "BLT", "#117864", 3600000, 550, false, `{"borders": ["FIN", "RUS", "POL", "PRU", "SWE"], "birth_year": 1989, "unlock_era": "modern", "parent": "RUS"}`},
		{"Czech Republic", "CZE", "#6C3483", 4600000, 620, false, `{"borders": ["HRE", "PRU", "POL", "AUT", "HUN"], "birth_year": 1989, "unlock_era": "modern", "parent": "HRE"}`},
		{"Republic of Croatia", "CRO", "#CB4335", 2800000, 490, false, `{"borders": ["VEN", "AUT", "HUN", "SRB", "ITA"], "birth_year": 1989, "unlock_era": "modern", "parent": "AUT"}`},
		{"Republic of Tunisia", "TUN", "#D68910", 3900000, 480, false, `{"borders": ["ALG", "ITA", "PAP"], "birth_year": 1989, "unlock_era": "modern", "parent": "FRA"}`},
	}

	tx, err := DB.Begin()
	if err != nil {
		return err
	}

	for _, k := range kingdoms {
		res, err := tx.Exec(
			`UPDATE countries SET name = $1, color = $2, is_island = $3, borders = $4::jsonb WHERE code = $5 AND era = 'medieval'`,
			k.name, k.color, k.isIsland, k.bordersJSON, k.code,
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
	if era == "" || era == "discovery" || era == "1500" {
		era = "medieval"
	}
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
		c.population, c.resources, c.troops, c.economy_rate, c.markets, c.infrastructure, c.investment, c.social_costs, c.territory_type, c.borders, c.is_island
		FROM countries c
		WHERE c.era = $1
		ORDER BY c.id ASC`, era)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var countries []models.Country
	for rows.Next() {
		var c models.Country
		var ownerID, ownerName sql.NullString
		if err := rows.Scan(&c.ID, &c.Name, &c.Code, &c.Color, &ownerID, &ownerName, &c.Population, &c.Resources, &c.Troops, &c.EconomyRate, &c.Markets, &c.Infrastructure, &c.Investment, &c.SocialCosts, &c.TerritoryType, &c.Borders, &c.IsIsland); err != nil {
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
	CountryID      int64
	Name           string
	Code           string
	Population     int64
	Resources      int64
	Troops         int64
	EconomyRate    int64
	Markets        int64
	Infrastructure int64
	Investment     int64
	SocialCosts    int64
	OwnerID        *int64
	OwnerName      *string
	CentralTroops  int64
	BorderTroops   map[string]int64
	GDP            int64
	CurrencyValue  float64
	InflationRate  float64
}

// GetKingdomDetail returns all command-center data for a country: basic info,
// central troop count, and per-border deployment counts.
func GetKingdomDetail(countryID int64) (*KingdomDetailRow, error) {
	var r KingdomDetailRow
	r.BorderTroops = map[string]int64{"N": 0, "S": 0, "E": 0, "W": 0}

	err := DB.QueryRow(
		`SELECT c.id, c.name, c.code, c.population, c.resources, c.troops, c.economy_rate,
		       c.markets, c.infrastructure, c.investment, c.social_costs,
		       c.owner_id, u.username
		 FROM countries c
		 LEFT JOIN player_countries pc ON pc.country_id = c.id AND pc.is_active = true
		 LEFT JOIN users u ON u.id = pc.user_id
		 WHERE c.id = $1`,
		countryID,
	).Scan(&r.CountryID, &r.Name, &r.Code, &r.Population, &r.Resources, &r.Troops, &r.EconomyRate,
		&r.Markets, &r.Infrastructure, &r.Investment, &r.SocialCosts,
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

// EconomySettingsRow describes the economic settings for a country.
type EconomySettingsRow struct {
	CountryID   int64 `json:"country_id"`
	EconomyRate int64 `json:"economy_rate"`
	Investment  int64 `json:"investment"`
	SocialCosts int64 `json:"social_costs"`
}

// GetEconomyRate returns the current economy_rate for a country.
func GetEconomyRate(countryID int64) (int64, error) {
	var rate int64
	err := DB.QueryRow(`SELECT economy_rate FROM countries WHERE id = $1`, countryID).Scan(&rate)
	return rate, err
}

// GetEconomySettings returns the economic settings for a country.
func GetEconomySettings(countryID int64) (EconomySettingsRow, error) {
	var r EconomySettingsRow
	err := DB.QueryRow(`SELECT economy_rate, investment, social_costs FROM countries WHERE id = $1`, countryID).Scan(&r.EconomyRate, &r.Investment, &r.SocialCosts)
	if err == sql.ErrNoRows {
		return r, nil
	}
	return r, err
}

// SetEconomySettings updates the economic settings for a country.
func SetEconomySettings(countryID int64, rate, investment, socialCosts int64) error {
	_, err := DB.Exec(`UPDATE countries SET economy_rate = $1, investment = $2, social_costs = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`, rate, investment, socialCosts, countryID)
	return err
}

// SetEconomyRate updates the economy_rate for a country.
func SetEconomyRate(countryID int64, rate int64) error {
	_, err := DB.Exec(`UPDATE countries SET economy_rate = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, rate, countryID)
	return err
}

// IncrementEconomyLevel atomically adjusts a country's markets or
// infrastructure build level; the column name is whitelisted.
func IncrementEconomyLevel(countryID int64, column string, delta int64) error {
	if column != "markets" && column != "infrastructure" {
		return fmt.Errorf("invalid economy level column %q", column)
	}
	_, err := DB.Exec(`UPDATE countries SET `+column+` = GREATEST(0, `+column+` + $1), updated_at = CURRENT_TIMESTAMP WHERE id = $2`, delta, countryID)
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
