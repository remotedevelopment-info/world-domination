package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	_ "github.com/lib/pq"
)

var DB *sql.DB

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
	ID, Population int64
	Username, Password, Email string
	IsActive bool
}, error) {
	user := &struct {
		ID, Population int64
		Username, Password, Email string
		IsActive bool
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
	return id, err
}

func GetCountries(era string) ([]map[string]interface{}, error) {
	rows, err := DB.Query(`SELECT id, name, code, color, owner_id, population, resources, territory_type FROM countries WHERE era = $1`, era)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var countries []map[string]interface{}
	for rows.Next() {
		var id int64
		var name, code, color, territoryType string
		var population, resources int64
		var ownerID sql.NullInt64
		if err := rows.Scan(&id, &name, &code, &color, &ownerID, &population, &resources, &territoryType); err != nil {
			return nil, err
		}
		country := map[string]interface{}{
			"id": id, "name": name, "code": code, "color": color,
			"population": population, "resources": resources, "territory_type": territoryType,
		}
		if ownerID.Valid {
			country["owner_id"] = ownerID.Int64
		} else {
			country["owner_id"] = nil
		}
		countries = append(countries, country)
	}
	return countries, rows.Err()
}

func AssignCountryToPlayer(userID, countryID int64) error {
	_, err := DB.Exec(`INSERT INTO player_countries (user_id, country_id, last_active) VALUES ($1, $2, $3)
		ON CONFLICT (user_id, country_id) DO UPDATE SET is_active = true, last_active = $3`,
		userID, countryID, time.Now())
	return err
}

func GetPlayerCountry(userID int64) (map[string]interface{}, error) {
	var countryID int64
	var countryName string
	var lastActive time.Time
	err := DB.QueryRow(`SELECT pc.country_id, c.name, pc.last_active FROM player_countries pc
		JOIN countries c ON pc.country_id = c.id WHERE pc.user_id = $1 AND pc.is_active = true`, userID).
		Scan(&countryID, &countryName, &lastActive)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"country_id": countryID, "country_name": countryName, "last_active": lastActive}, nil
}

func UpdatePlayerActivity(userID int64) error {
	_, err := DB.Exec("UPDATE player_countries SET last_active = $1 WHERE user_id = $2", time.Now(), userID)
	return err
}

func UpdateUserLastLogin(userID int64) error {
	_, err := DB.Exec("UPDATE users SET last_login = $1 WHERE id = $2", time.Now(), userID)
	return err
}