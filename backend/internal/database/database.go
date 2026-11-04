package database

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/lib/pq"

	"kingdom-conquest/backend/internal/models"
	"kingdom-conquest/backend/pkg/auth"
)

var DB *sql.DB

// IsAdminIdentifier returns true if the email or username matches recognized administrative identities.
func IsAdminIdentifier(identifier string) bool {
	id := strings.ToLower(strings.TrimSpace(identifier))
	return id == "admin@sfsw.net" || id == "admin" || id == "nalex@sfsw.net" || id == "nalex"
}

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
	ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(32) DEFAULT 'player';

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

	// Promote any existing admin or nalex accounts to admin role
	_, _ = DB.Exec(`
		UPDATE users 
		SET role = 'admin' 
		WHERE LOWER(email) IN ('admin@sfsw.net', 'nalex@sfsw.net')
		   OR LOWER(username) IN ('admin', 'admin@sfsw.net', 'nalex', 'nalex@sfsw.net')
	`)

	// Ensure dedicated admin user exists with login admin@sfsw.net (password: password123)
	var adminExists bool
	_ = DB.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(email) = 'admin@sfsw.net' OR LOWER(username) = 'admin')").Scan(&adminExists)
	if !adminExists {
		hashed, err := auth.HashPassword("password123")
		if err == nil {
			_, _ = DB.Exec(`
				INSERT INTO users (username, password, email, base_color, role) 
				VALUES ($1, $2, $3, $4, $5) 
				ON CONFLICT DO NOTHING`,
				"admin", hashed, "admin@sfsw.net", "#D4AF37", "admin")
			log.Println("Seeded default admin user: admin@sfsw.net / password123")
		}
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
		{"Crown of Spain", "ESP", "#D35400", 8500000, 750, false, "{\"borders\": [\"POR\", \"FRA\", \"MAR\", \"ALG\"], \"birth_year\": 1500, \"unlock_era\": \"discovery\", \"parent\": \"\"}"},
		{"Kingdom of Portugal", "POR", "#16A085", 2200000, 450, false, "{\"borders\": [\"ESP\", \"MAR\"], \"birth_year\": 1500, \"unlock_era\": \"discovery\", \"parent\": \"\"}"},
		{"Kingdom of France", "FRA", "#2980B9", 16000000, 850, false, "{\"borders\": [\"ESP\", \"HRE\", \"ENG\", \"NED\", \"ITA\", \"ALG\", \"BEL\", \"SWI\"], \"birth_year\": 1500, \"unlock_era\": \"discovery\", \"parent\": \"\"}"},
		{"Kingdom of England", "ENG", "#C0392B", 4500000, 600, true, "{\"borders\": [\"FRA\", \"SCO\", \"IRL\", \"NED\", \"NOR\"], \"birth_year\": 1500, \"unlock_era\": \"discovery\", \"parent\": \"\"}"},
		{"Holy Roman Empire", "HRE", "#D4AC0D", 14000000, 900, false, "{\"borders\": [\"FRA\", \"VEN\", \"POL\", \"KAL\", \"NED\", \"PRU\", \"ITA\", \"AUT\", \"CZE\", \"SWI\"], \"birth_year\": 1500, \"unlock_era\": \"discovery\", \"parent\": \"\"}"},
		{"Ottoman Empire", "OTT", "#1B4F72", 12000000, 1000, false, "{\"borders\": [\"VEN\", \"POL\", \"GRE\", \"ROM\", \"SRB\", \"EGY\", \"TUR\", \"SYR\", \"IRQ\"], \"birth_year\": 1500, \"unlock_era\": \"discovery\", \"parent\": \"\"}"},
		{"Republic of Venice", "VEN", "#00A8FF", 1800000, 700, false, "{\"borders\": [\"HRE\", \"OTT\", \"PAP\", \"ITA\", \"AUT\", \"SRB\", \"CRO\", \"GRE\"], \"birth_year\": 1500, \"death_year\": 1797, \"unlock_era\": \"discovery\", \"parent\": \"\"}"},
		{"Papal States", "PAP", "#A569BD", 1500000, 500, false, "{\"borders\": [\"VEN\", \"ITA\", \"GRE\", \"TUN\", \"NAP\"], \"birth_year\": 1500, \"death_year\": 1870, \"unlock_era\": \"discovery\", \"parent\": \"\"}"},
		{"Poland-Lithuania", "POL", "#8E44AD", 6500000, 650, false, "{\"borders\": [\"HRE\", \"OTT\", \"RUS\", \"PRU\", \"AUT\", \"ROM\", \"HUN\", \"UKR\", \"BLT\", \"CZE\"], \"birth_year\": 1500, \"death_year\": 1795, \"unlock_era\": \"discovery\", \"parent\": \"\"}"},
		{"Tsardom of Muscovy", "RUS", "#795548", 5000000, 500, false, "{\"borders\": [\"POL\", \"KAL\", \"SWE\", \"ROM\", \"FIN\", \"UKR\", \"BLT\"], \"birth_year\": 1500, \"unlock_era\": \"discovery\", \"parent\": \"\"}"},
		{"Kalmar Union", "KAL", "#34495E", 2000000, 400, false, "{\"borders\": [\"HRE\", \"RUS\", \"SWE\", \"PRU\", \"NOR\", \"DEN\"], \"birth_year\": 1500, \"unlock_era\": \"discovery\", \"parent\": \"\"}"},
		{"Kingdom of Scotland", "SCO", "#2E86C1", 1300000, 350, true, "{\"borders\": [\"ENG\", \"IRL\", \"NOR\"], \"birth_year\": 1500, \"unlock_era\": \"discovery\", \"parent\": \"\"}"},
		{"Dutch Republic", "NED", "#E67E22", 2100000, 650, false, "{\"borders\": [\"FRA\", \"HRE\", \"ENG\", \"BEL\"], \"birth_year\": 1750, \"unlock_era\": \"revolt\", \"parent\": \"HRE\"}"},
		{"Kingdom of Prussia", "PRU", "#2C3E50", 5400000, 700, false, "{\"borders\": [\"HRE\", \"POL\", \"KAL\", \"SWE\", \"BLT\", \"CZE\", \"SAX\"], \"birth_year\": 1750, \"death_year\": 1871, \"unlock_era\": \"revolt\", \"parent\": \"HRE\"}"},
		{"Kingdom of Sweden", "SWE", "#F1C40F", 2400000, 520, false, "{\"borders\": [\"KAL\", \"NOR\", \"RUS\", \"PRU\", \"FIN\", \"BLT\", \"DEN\"], \"birth_year\": 1523, \"unlock_era\": \"discovery\", \"parent\": \"KAL\"}"},
		{"Kingdom of Denmark", "DEN", "#C0392B", 1200000, 410, false, "{\"borders\": [\"HRE\", \"SWE\", \"NOR\", \"KAL\"], \"birth_year\": 1523, \"unlock_era\": \"discovery\", \"parent\": \"KAL\"}"},
		{"Hellenic Republic", "GRE", "#3498DB", 1600000, 420, false, "{\"borders\": [\"OTT\", \"VEN\", \"PAP\", \"SRB\", \"EGY\"], \"birth_year\": 1750, \"unlock_era\": \"revolt\", \"parent\": \"OTT\"}"},
		{"Swiss Confederacy", "SWI", "#E74C3C", 1500000, 480, false, "{\"borders\": [\"FRA\", \"HRE\", \"ITA\", \"AUT\"], \"birth_year\": 1750, \"unlock_era\": \"revolt\", \"parent\": \"HRE\"}"},
		{"Republic of Genoa", "GEN", "#1ABC9C", 900000, 450, false, "{\"borders\": [\"FRA\", \"HRE\", \"PAP\", \"ITA\"], \"birth_year\": 1750, \"death_year\": 1815, \"unlock_era\": \"revolt\", \"parent\": \"HRE\"}"},
		{"Kingdom of Naples", "NAP", "#D35400", 3800000, 520, false, "{\"borders\": [\"PAP\", \"ITA\", \"GRE\", \"TUN\"], \"birth_year\": 1750, \"death_year\": 1860, \"unlock_era\": \"revolt\", \"parent\": \"ESP\"}"},
		{"Electorate of Bavaria", "BAV", "#5DADE2", 1800000, 460, false, "{\"borders\": [\"HRE\", \"AUT\", \"SWI\", \"CZE\"], \"birth_year\": 1750, \"death_year\": 1871, \"unlock_era\": \"revolt\", \"parent\": \"HRE\"}"},
		{"Electorate of Saxony", "SAX", "#AF7AC5", 1600000, 440, false, "{\"borders\": [\"HRE\", \"PRU\", \"CZE\", \"POL\"], \"birth_year\": 1750, \"death_year\": 1871, \"unlock_era\": \"revolt\", \"parent\": \"HRE\"}"},
		{"Sultanate of Morocco", "MOR", "#A93226", 3200000, 430, false, "{\"borders\": [\"ESP\", \"POR\", \"ALG\"], \"birth_year\": 1750, \"unlock_era\": \"revolt\", \"parent\": \"ESP\"}"},
		{"Safavid Persia", "PER_EM", "#138D75", 7000000, 650, false, "{\"borders\": [\"OTT\", \"RUS\", \"AFG\", \"PAK\", \"IRQ\"], \"birth_year\": 1750, \"unlock_era\": \"revolt\", \"parent\": \"OTT\"}"},
		{"Mughal Empire", "MUG", "#B7950B", 25000000, 950, false, "{\"borders\": [\"PER_EM\", \"AFG\", \"IND\", \"PAK\"], \"birth_year\": 1750, \"unlock_era\": \"revolt\", \"parent\": \"OTT\"}"},
		{"Kingdom of Italy", "ITA", "#27AE60", 25000000, 750, false, "{\"borders\": [\"FRA\", \"HRE\", \"VEN\", \"PAP\", \"AUT\", \"CRO\", \"TUN\", \"SWI\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"HRE\"}"},
		{"Austria-Hungary", "AUH", "#B03A2E", 36000000, 820, false, "{\"borders\": [\"HRE\", \"ITA\", \"VEN\", \"POL\", \"ROM\", \"SRB\", \"HUN\", \"CZE\", \"CRO\", \"SWI\"], \"birth_year\": 1860, \"death_year\": 1918, \"unlock_era\": \"independence\", \"parent\": \"HRE\"}"},
		{"Republic of Austria", "AUT", "#C0392B", 6500000, 680, false, "{\"borders\": [\"DEU\", \"HRE\", \"ITA\", \"SWI\", \"CZE\", \"CZE_SLO\", \"SVK\", \"HUN\", \"SVN\", \"YUG\"], \"birth_year\": 1918, \"unlock_era\": \"decolonisation\", \"parent\": \"AUH\"}"},
		{"Federal Republic of Germany", "DEU", "#2C3E50", 65000000, 950, false, "{\"borders\": [\"FRA\", \"BEL\", \"NED\", \"DEN\", \"POL_REP\", \"CZE\", \"AUT\", \"SWI\"], \"birth_year\": 1871, \"unlock_era\": \"independence\", \"parent\": \"PRU\"}"},
		{"Kingdom of Romania", "ROM", "#F39C12", 6500000, 580, false, "{\"borders\": [\"POL\", \"RUS\", \"OTT\", \"AUT\", \"SRB\", \"HUN\", \"UKR\", \"BUL\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"OTT\"}"},
		{"Kingdom of Serbia", "SRB", "#922B21", 3100000, 460, false, "{\"borders\": [\"OTT\", \"VEN\", \"AUT\", \"ROM\", \"GRE\", \"HUN\", \"CRO\", \"BUL\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"OTT\"}"},
		{"Kingdom of Norway", "NOR", "#BA4A00", 2200000, 490, false, "{\"borders\": [\"SWE\", \"KAL\", \"ENG\", \"SCO\", \"FIN\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"KAL\"}"},
		{"Kingdom of Belgium", "BEL", "#F4D03F", 4800000, 620, false, "{\"borders\": [\"FRA\", \"NED\", \"HRE\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"NED\"}"},
		{"Principality of Bulgaria", "BUL", "#117864", 3500000, 480, false, "{\"borders\": [\"OTT\", \"ROM\", \"SRB\", \"GRE\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"OTT\"}"},
		{"United States of America", "USA", "#1F618D", 31000000, 1100, false, "{\"borders\": [\"CAN\", \"MEX\", \"CUB\", \"BHS\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"ENG\"}"},
		{"Dominion of Canada", "CAN", "#C0392B", 3400000, 750, false, "{\"borders\": [\"USA\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"ENG\"}"},
		{"Mexican Republic", "MEX", "#27AE60", 8400000, 680, false, "{\"borders\": [\"USA\", \"GUA\", \"BLZ\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"ESP\"}"},
		{"Captaincy of Cuba", "CUB", "#E67E22", 1400000, 500, true, "{\"borders\": [\"USA\", \"HAI\", \"JAM\", \"MEX\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"ESP\"}"},
		{"Republic of Haiti", "HAI", "#8E44AD", 950000, 380, true, "{\"borders\": [\"DOM\", \"CUB\", \"JAM\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"FRA\"}"},
		{"Dominican Republic", "DOM", "#2980B9", 300000, 350, true, "{\"borders\": [\"HAI\", \"PUR\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"ESP\"}"},
		{"Republic of Guatemala", "GUA", "#5DADE2", 1200000, 420, false, "{\"borders\": [\"MEX\", \"HON\", \"SLV\", \"BLZ\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"MEX\"}"},
		{"Republic of Honduras", "HON", "#2874A6", 400000, 360, false, "{\"borders\": [\"GUA\", \"SLV\", \"NIC\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"MEX\"}"},
		{"Republic of El Salvador", "SLV", "#1B4F72", 600000, 370, false, "{\"borders\": [\"GUA\", \"HON\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"MEX\"}"},
		{"Republic of Nicaragua", "NIC", "#48C9B0", 500000, 380, false, "{\"borders\": [\"HON\", \"CRI\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"MEX\"}"},
		{"Republic of Costa Rica", "CRI", "#16A085", 200000, 350, false, "{\"borders\": [\"NIC\", \"PAN\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"MEX\"}"},
		{"Isthmus of Panama", "PAN", "#D4AC0D", 250000, 440, false, "{\"borders\": [\"CRI\", \"COL\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"COL\"}"},
		{"Empire of Brazil", "BRA", "#229954", 10000000, 950, false, "{\"borders\": [\"ARG\", \"COL\", \"VEN_SA\", \"PER\", \"BOL\", \"PAR\", \"URY\", \"GUY\", \"SUR\", \"GUF\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"POR\"}"},
		{"Argentine Republic", "ARG", "#5DADE2", 1800000, 720, false, "{\"borders\": [\"BRA\", \"CHL\", \"BOL\", \"PAR\", \"URY\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"ESP\"}"},
		{"United States of Colombia", "COL", "#F1C40F", 2900000, 640, false, "{\"borders\": [\"PAN\", \"VEN_SA\", \"ECU\", \"PER\", \"BRA\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"ESP\"}"},
		{"Republic of Venezuela", "VEN_SA", "#E74C3C", 1700000, 600, false, "{\"borders\": [\"COL\", \"BRA\", \"GUY\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"ESP\"}"},
		{"Republic of Peru", "PER", "#C0392B", 2500000, 650, false, "{\"borders\": [\"ECU\", \"COL\", \"BRA\", \"BOL\", \"CHL\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"ESP\"}"},
		{"Republic of Chile", "CHL", "#2980B9", 1700000, 580, false, "{\"borders\": [\"PER\", \"BOL\", \"ARG\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"ESP\"}"},
		{"Republic of Bolivia", "BOL", "#F39C12", 1500000, 540, false, "{\"borders\": [\"PER\", \"BRA\", \"PAR\", \"ARG\", \"CHL\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"ESP\"}"},
		{"Republic of Ecuador", "ECU", "#F4D03F", 900000, 420, false, "{\"borders\": [\"COL\", \"PER\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"ESP\"}"},
		{"Republic of Paraguay", "PAR", "#D35400", 450000, 480, false, "{\"borders\": [\"ARG\", \"BRA\", \"BOL\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"ESP\"}"},
		{"Oriental Republic of Uruguay", "URY", "#3498DB", 250000, 410, false, "{\"borders\": [\"ARG\", \"BRA\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"ESP\"}"},
		{"British Guiana", "GUY", "#C0392B", 150000, 360, false, "{\"borders\": [\"VEN_SA\", \"BRA\", \"SUR\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"ENG\"}"},
		{"Dutch Surinam", "SUR", "#E67E22", 60000, 340, false, "{\"borders\": [\"GUY\", \"BRA\", \"GUF\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"NED\"}"},
		{"French Guiana", "GUF", "#2471A3", 30000, 320, false, "{\"borders\": [\"SUR\", \"BRA\"], \"birth_year\": 1860, \"unlock_era\": \"independence\", \"parent\": \"FRA\"}"},
		{"Commonwealth of Australia", "AUS", "#117864", 5400000, 850, true, "{\"borders\": [\"NZL\", \"PNG\", \"IDN\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Dominion of New Zealand", "NZL", "#1ABC9C", 1250000, 580, true, "{\"borders\": [\"AUS\", \"FJI\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Territory of Papua", "PNG", "#7D6608", 1100000, 420, true, "{\"borders\": [\"IDN\", \"AUS\", \"SLB\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"AUS\"}"},
		{"Irish Free State", "IRL", "#2ECC71", 3000000, 480, true, "{\"borders\": [\"ENG\", \"SCO\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Republic of Finland", "FIN", "#5DADE2", 3150000, 520, false, "{\"borders\": [\"SWE\", \"NOR\", \"RUS\", \"BLT\", \"EST\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"RUS\"}"},
		{"Republic of Hungary", "HUN", "#1E8449", 7900000, 560, false, "{\"borders\": [\"AUT\", \"ROM\", \"SRB\", \"CRO\", \"CZE\", \"UKR\", \"SVK\"], \"birth_year\": 1918, \"unlock_era\": \"decolonisation\", \"parent\": \"AUH\"}"},
		{"Republic of Poland", "POL_REP", "#8E44AD", 27000000, 780, false, "{\"borders\": [\"PRU\", \"CZE\", \"ROM\", \"RUS\", \"BLR\", \"UKR\", \"LTU\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"RUS\"}"},
		{"Union of Soviet Socialist Republics", "USSR", "#C0392B", 180000000, 1200, false, "{\"borders\": [\"POL_REP\", \"FIN\", \"ROM\", \"TUR\", \"PER_EM\", \"AFG\", \"CHN\", \"MNG\", \"PRK\", \"NOR\", \"SWE\"], \"birth_year\": 1920, \"death_year\": 1989, \"unlock_era\": \"decolonisation\", \"parent\": \"RUS\"}"},
		{"Czechoslovakia", "CZE_SLO", "#6C3483", 13500000, 720, false, "{\"borders\": [\"HRE\", \"AUT\", \"HUN\", \"POL_REP\", \"ROM\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"AUT\"}"},
		{"Kingdom of Yugoslavia", "YUG", "#78281F", 12000000, 650, false, "{\"borders\": [\"ITA\", \"AUT\", \"HUN\", \"ROM\", \"BUL\", \"GRE\", \"ALB\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"SRB\"}"},
		{"Republic of Turkey", "TUR", "#C0392B", 13000000, 780, false, "{\"borders\": [\"GRE\", \"BUL\", \"SYR\", \"IRQ\", \"PER_EM\", \"ARM\", \"GEO\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"OTT\"}"},
		{"Kingdom of Egypt", "EGY", "#B7950B", 13500000, 720, false, "{\"borders\": [\"LBY\", \"SDN\", \"ISR\", \"SAU\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"OTT\"}"},
		{"State of Syria", "SYR", "#1E8449", 1500000, 480, false, "{\"borders\": [\"TUR\", \"IRQ\", \"JOR\", \"LBN\", \"ISR\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"OTT\"}"},
		{"Kingdom of Iraq", "IRQ", "#2874A6", 3000000, 620, false, "{\"borders\": [\"TUR\", \"PER_EM\", \"KWT\", \"SAU\", \"JOR\", \"SYR\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"OTT\"}"},
		{"Greater Lebanon", "LBN", "#E74C3C", 600000, 380, false, "{\"borders\": [\"SYR\", \"ISR\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"FRA\"}"},
		{"Emirate of Transjordan", "JOR", "#9A7D0A", 400000, 360, false, "{\"borders\": [\"SYR\", \"IRQ\", \"SAU\", \"ISR\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Kingdom of Saudi Arabia", "SAU", "#145A32", 2500000, 800, false, "{\"borders\": [\"JOR\", \"IRQ\", \"KWT\", \"ARE\", \"OMN\", \"YEM\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"OTT\"}"},
		{"State of Israel", "ISR", "#2980B9", 800000, 520, false, "{\"borders\": [\"LBN\", \"SYR\", \"JOR\", \"EGY\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Dominion of India", "IND", "#D35400", 320000000, 1200, false, "{\"borders\": [\"PAK\", \"BGD\", \"CHN\", \"NPL\", \"MMR\", \"BTN\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Dominion of Pakistan", "PAK", "#117864", 35000000, 750, false, "{\"borders\": [\"IND\", \"AFG\", \"PER_EM\", \"CHN\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"East Bengal / Bangladesh", "BGD", "#1E8449", 42000000, 620, false, "{\"borders\": [\"IND\", \"MMR\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"PAK\"}"},
		{"Republic of Indonesia", "IDN", "#C0392B", 60000000, 950, true, "{\"borders\": [\"MYS\", \"PNG\", \"TLS\", \"AUS\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"NED\"}"},
		{"Commonwealth of the Philippines", "PHL", "#2980B9", 10500000, 680, true, "{\"borders\": [\"TWN\", \"MYS\", \"IDN\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"USA\"}"},
		{"Empire of Vietnam", "VNM", "#D4AC0D", 18000000, 700, false, "{\"borders\": [\"CHN\", \"LAO\", \"KHM\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"FRA\"}"},
		{"Kingdom of Thailand", "THA", "#8E44AD", 9500000, 660, false, "{\"borders\": [\"MMR\", \"LAO\", \"KHM\", \"MYS\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"\"}"},
		{"Union of Burma", "MMR", "#F39C12", 13000000, 640, false, "{\"borders\": [\"IND\", \"BGD\", \"CHN\", \"LAO\", \"THA\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Federation of Malaya", "MYS", "#27AE60", 3300000, 680, false, "{\"borders\": [\"THA\", \"IDN\", \"SGP\", \"BRN\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Republic of China", "CHN", "#E74C3C", 450000000, 1300, false, "{\"borders\": [\"RUS\", \"MNG\", \"KOR\", \"IND\", \"MMR\", \"VNM\", \"LAO\", \"PAK\", \"AFG\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"\"}"},
		{"Empire of Japan", "JPN", "#C0392B", 56000000, 1050, true, "{\"borders\": [\"RUS\", \"KOR\", \"USA\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"\"}"},
		{"Korean Peninsula", "KOR", "#3498DB", 17000000, 650, false, "{\"borders\": [\"CHN\", \"RUS\", \"JPN\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"JPN\"}"},
		{"Kingdom of Afghanistan", "AFG", "#795548", 6000000, 520, false, "{\"borders\": [\"PER_EM\", \"PAK\", \"CHN\", \"RUS\", \"TJK\", \"UZB\", \"TKM\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Kingdom of Nepal", "NPL", "#C0392B", 4500000, 440, false, "{\"borders\": [\"IND\", \"CHN\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Dominion of Ceylon / Sri Lanka", "LKA", "#D4AC0D", 4500000, 480, true, "{\"borders\": [\"IND\", \"MDV\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Kingdom of Cambodia", "KHM", "#16A085", 2500000, 460, false, "{\"borders\": [\"THA\", \"LAO\", \"VNM\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"FRA\"}"},
		{"Kingdom of Laos", "LAO", "#2980B9", 1200000, 420, false, "{\"borders\": [\"CHN\", \"VNM\", \"KHM\", \"THA\", \"MMR\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"FRA\"}"},
		{"State of Mongolia", "MNG", "#2C3E50", 700000, 450, false, "{\"borders\": [\"RUS\", \"CHN\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"CHN\"}"},
		{"Kingdom of Morocco", "MAR", "#A93226", 5200000, 520, false, "{\"borders\": [\"ESP\", \"POR\", \"ALG\", \"MRT\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"FRA\"}"},
		{"Republic of Algeria", "ALG", "#229954", 6800000, 640, false, "{\"borders\": [\"MAR\", \"ESP\", \"FRA\", \"TUN\", \"LBY\", \"NER\", \"MLI\", \"MRT\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"FRA\"}"},
		{"Republic of Tunisia", "TUN", "#D68910", 2200000, 480, false, "{\"borders\": [\"ALG\", \"ITA\", \"PAP\", \"LBY\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"FRA\"}"},
		{"Kingdom of Libya", "LBY", "#117864", 1100000, 580, false, "{\"borders\": [\"TUN\", \"ALG\", \"NER\", \"TCD\", \"SDN\", \"EGY\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ITA\"}"},
		{"Republic of the Sudan", "SDN", "#78281F", 5500000, 560, false, "{\"borders\": [\"EGY\", \"LBY\", \"TCD\", \"CAF\", \"SSD\", \"ETH\", \"ERI\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Ethiopian Empire", "ETH", "#1E8449", 11000000, 650, false, "{\"borders\": [\"SDN\", \"SSD\", \"KEN\", \"SOM\", \"DJI\", \"ERI\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"\"}"},
		{"Federation of Nigeria", "NGA", "#27AE60", 18000000, 780, false, "{\"borders\": [\"BEN\", \"NER\", \"TCD\", \"CMR\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Republic of Ghana", "GHA", "#F1C40F", 3200000, 520, false, "{\"borders\": [\"CIV\", \"BFA\", \"TGO\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Republic of Kenya", "KEN", "#C0392B", 3800000, 580, false, "{\"borders\": [\"ETH\", \"SSD\", \"UGA\", \"TZA\", \"SOM\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Union of South Africa", "ZAF", "#D35400", 7000000, 820, false, "{\"borders\": [\"NAM\", \"BWA\", \"ZWE\", \"MOZ\", \"LSO\", \"SWZ\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Republic of the Congo", "COD", "#2980B9", 10000000, 750, false, "{\"borders\": [\"COG\", \"CAF\", \"SSD\", \"UGA\", \"RWA\", \"BDI\", \"TZA\", \"ZMB\", \"AGO\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"BEL\"}"},
		{"Republic of Tanzania", "TZA", "#138D75", 4800000, 580, false, "{\"borders\": [\"KEN\", \"UGA\", \"RWA\", \"BDI\", \"COD\", \"ZMB\", \"MWI\", \"MOZ\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Republic of Uganda", "UGA", "#F39C12", 3100000, 480, false, "{\"borders\": [\"SSD\", \"KEN\", \"TZA\", \"RWA\", \"COD\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"People's Republic of Angola", "AGO", "#B03A2E", 3600000, 620, false, "{\"borders\": [\"COG\", \"COD\", \"ZMB\", \"NAM\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"POR\"}"},
		{"Republic of Mozambique", "MOZ", "#16A085", 3500000, 560, false, "{\"borders\": [\"TZA\", \"MWI\", \"ZMB\", \"ZWE\", \"ZAF\", \"SWZ\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"POR\"}"},
		{"Republic of Zimbabwe", "ZWE", "#D4AC0D", 1600000, 500, false, "{\"borders\": [\"ZMB\", \"MOZ\", \"ZAF\", \"BWA\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Republic of Zambia", "ZMB", "#2ECC71", 1400000, 520, false, "{\"borders\": [\"COD\", \"TZA\", \"MWI\", \"MOZ\", \"ZWE\", \"BWA\", \"NAM\", \"AGO\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Republic of Senegal", "SEN", "#27AE60", 1300000, 460, false, "{\"borders\": [\"MRT\", \"MLI\", \"GIN\", \"GNB\", \"GMB\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"FRA\"}"},
		{"Republic of Côte d'Ivoire", "CIV", "#E67E22", 1800000, 520, false, "{\"borders\": [\"LBR\", \"GIN\", \"MLI\", \"BFA\", \"GHA\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"FRA\"}"},
		{"Republic of Cameroon", "CMR", "#117864", 2500000, 520, false, "{\"borders\": [\"NGA\", \"TCD\", \"CAF\", \"COG\", \"GAB\", \"GNQ\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"FRA\"}"},
		{"Malagasy Republic", "MDG", "#8E44AD", 3400000, 520, true, "{\"borders\": [\"MOZ\", \"MUS\", \"COM\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"FRA\"}"},
		{"Republic of Mali", "MLI", "#F4D03F", 2600000, 480, false, "{\"borders\": [\"MRT\", \"ALG\", \"NER\", \"BFA\", \"CIV\", \"GIN\", \"SEN\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"FRA\"}"},
		{"Republic of Niger", "NER", "#E67E22", 1600000, 460, false, "{\"borders\": [\"ALG\", \"LBY\", \"TCD\", \"NGA\", \"BEN\", \"BFA\", \"MLI\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"FRA\"}"},
		{"Republic of Chad", "TCD", "#2980B9", 1500000, 450, false, "{\"borders\": [\"LBY\", \"SDN\", \"CAF\", \"CMR\", \"NGA\", \"NER\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"FRA\"}"},
		{"Somali Republic", "SOM", "#3498DB", 1200000, 420, false, "{\"borders\": [\"DJI\", \"ETH\", \"KEN\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ITA\"}"},
		{"Republic of Guinea", "GIN", "#C0392B", 1500000, 440, false, "{\"borders\": [\"GNB\", \"SEN\", \"MLI\", \"CIV\", \"LBR\", \"SLE\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"FRA\"}"},
		{"Republic of Burkina Faso", "BFA", "#D35400", 2800000, 440, false, "{\"borders\": [\"MLI\", \"NER\", \"BEN\", \"TGO\", \"GHA\", \"CIV\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"FRA\"}"},
		{"Republic of Benin", "BEN", "#16A085", 1100000, 400, false, "{\"borders\": [\"TGO\", \"BFA\", \"NER\", \"NGA\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"FRA\"}"},
		{"Republic of Sierra Leone", "SLE", "#27AE60", 1400000, 420, false, "{\"borders\": [\"GIN\", \"LBR\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Republic of Liberia", "LBR", "#1F618D", 700000, 410, false, "{\"borders\": [\"SLE\", \"GIN\", \"CIV\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"USA\"}"},
		{"Republic of Malawi", "MWI", "#8E44AD", 1200000, 390, false, "{\"borders\": [\"TZA\", \"MOZ\", \"ZMB\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Republic of Botswana", "BWA", "#5DADE2", 250000, 480, false, "{\"borders\": [\"NAM\", \"ZMB\", \"ZWE\", \"ZAF\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ENG\"}"},
		{"Territory of Namibia", "NAM", "#E67E22", 300000, 460, false, "{\"borders\": [\"AGO\", \"ZMB\", \"BWA\", \"ZAF\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"ZAF\"}"},
		{"Republic of Rwanda", "RWA", "#117864", 1500000, 380, false, "{\"borders\": [\"UGA\", \"TZA\", \"BDI\", \"COD\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"BEL\"}"},
		{"Republic of Burundi", "BDI", "#A93226", 1300000, 370, false, "{\"borders\": [\"RWA\", \"TZA\", \"COD\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"BEL\"}"},
		{"Republic of the Congo-Brazzaville", "COG", "#27AE60", 800000, 440, false, "{\"borders\": [\"GAB\", \"CMR\", \"CAF\", \"COD\", \"AGO\"], \"birth_year\": 1920, \"unlock_era\": \"decolonisation\", \"parent\": \"FRA\"}"},
		{"Ukraine", "UKR", "#2874A6", 48000000, 920, false, "{\"borders\": [\"RUS\", \"POL_REP\", \"ROM\", \"HUN\", \"BLR\", \"MDA\", \"SVK\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"USSR\"}"},
		{"Republic of Belarus", "BLR", "#117864", 10000000, 680, false, "{\"borders\": [\"RUS\", \"POL_REP\", \"UKR\", \"LTU\", \"LVA\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"USSR\"}"},
		{"Republic of Kazakhstan", "KAZ", "#1F618D", 16500000, 950, false, "{\"borders\": [\"RUS\", \"CHN\", \"KGZ\", \"UZB\", \"TKM\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"USSR\"}"},
		{"Republic of Uzbekistan", "UZB", "#16A085", 20000000, 750, false, "{\"borders\": [\"KAZ\", \"KGZ\", \"TJK\", \"AFG\", \"TKM\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"USSR\"}"},
		{"Turkmenistan", "TKM", "#27AE60", 3700000, 720, false, "{\"borders\": [\"KAZ\", \"UZB\", \"AFG\", \"PER_EM\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"USSR\"}"},
		{"Kyrgyz Republic", "KGZ", "#C0392B", 4400000, 520, false, "{\"borders\": [\"KAZ\", \"CHN\", \"TJK\", \"UZB\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"USSR\"}"},
		{"Republic of Tajikistan", "TJK", "#D35400", 5200000, 510, false, "{\"borders\": [\"UZB\", \"KGZ\", \"CHN\", \"AFG\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"USSR\"}"},
		{"Georgia", "GEO", "#C0392B", 5400000, 560, false, "{\"borders\": [\"RUS\", \"AZE\", \"ARM\", \"TUR\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"USSR\"}"},
		{"Republic of Armenia", "ARM", "#E67E22", 3500000, 480, false, "{\"borders\": [\"GEO\", \"AZE\", \"TUR\", \"PER_EM\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"USSR\"}"},
		{"Republic of Azerbaijan", "AZE", "#2980B9", 7100000, 780, false, "{\"borders\": [\"RUS\", \"GEO\", \"ARM\", \"PER_EM\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"USSR\"}"},
		{"Republic of Moldova", "MDA", "#F39C12", 4300000, 460, false, "{\"borders\": [\"ROM\", \"UKR\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"USSR\"}"},
		{"Republic of Estonia", "EST", "#3498DB", 1500000, 520, false, "{\"borders\": [\"RUS\", \"LVA\", \"FIN\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"USSR\"}"},
		{"Republic of Latvia", "LVA", "#78281F", 2600000, 510, false, "{\"borders\": [\"EST\", \"RUS\", \"BLR\", \"LTU\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"USSR\"}"},
		{"Republic of Lithuania", "LTU", "#D4AC0D", 3700000, 540, false, "{\"borders\": [\"LVA\", \"BLR\", \"POL_REP\", \"RUS\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"USSR\"}"},
		{"Republic of Croatia", "CRO", "#CB4335", 4700000, 580, false, "{\"borders\": [\"SVN\", \"HUN\", \"SRB\", \"BIH\", \"MNE\", \"ITA\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"YUG\"}"},
		{"Republic of Slovenia", "SVN", "#1E8449", 2000000, 560, false, "{\"borders\": [\"ITA\", \"AUT\", \"HUN\", \"CRO\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"YUG\"}"},
		{"Bosnia and Herzegovina", "BIH", "#2874A6", 4400000, 510, false, "{\"borders\": [\"CRO\", \"SRB\", \"MNE\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"YUG\"}"},
		{"North Macedonia", "MKD", "#D35400", 2000000, 460, false, "{\"borders\": [\"SRB\", \"KOS\", \"BUL\", \"GRE\", \"ALB\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"YUG\"}"},
		{"Montenegro", "MNE", "#922B21", 620000, 440, false, "{\"borders\": [\"BIH\", \"SRB\", \"KOS\", \"ALB\", \"CRO\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"YUG\"}"},
		{"Republic of Kosovo", "KOS", "#1B4F72", 1800000, 420, false, "{\"borders\": [\"SRB\", \"MKD\", \"ALB\", \"MNE\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"SRB\"}"},
		{"Slovak Republic", "SVK", "#2E86C1", 5300000, 620, false, "{\"borders\": [\"CZE\", \"POL_REP\", \"UKR\", \"HUN\", \"AUT\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"CZE_SLO\"}"},
		{"Czech Republic", "CZE", "#6C3483", 10300000, 780, false, "{\"borders\": [\"HRE\", \"POL_REP\", \"SVK\", \"AUT\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"CZE_SLO\"}"},
		{"United Arab Emirates", "ARE", "#117864", 1800000, 920, false, "{\"borders\": [\"SAU\", \"OMN\", \"QAT\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"State of Qatar", "QAT", "#78281F", 470000, 880, false, "{\"borders\": [\"SAU\", \"ARE\", \"BHR\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"State of Kuwait", "KWT", "#1E8449", 2100000, 890, false, "{\"borders\": [\"IRQ\", \"SAU\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Sultanate of Oman", "OMN", "#D4AC0D", 1800000, 720, false, "{\"borders\": [\"ARE\", \"SAU\", \"YEM\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Republic of Yemen", "YEM", "#A93226", 11500000, 560, false, "{\"borders\": [\"SAU\", \"OMN\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"OTT\"}"},
		{"Kingdom of Bahrain", "BHR", "#C0392B", 500000, 650, true, "{\"borders\": [\"SAU\", \"QAT\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Republic of Cyprus", "CYP", "#E67E22", 750000, 540, true, "{\"borders\": [\"TUR\", \"GRE\", \"SYR\", \"LBN\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Republic of Singapore", "SGP", "#C0392B", 3000000, 950, true, "{\"borders\": [\"MYS\", \"IDN\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"MYS\"}"},
		{"Democratic People's Republic of Korea", "PRK", "#922B21", 20000000, 580, false, "{\"borders\": [\"CHN\", \"RUS\", \"KOR_S\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"KOR\"}"},
		{"Republic of Korea", "KOR_S", "#2980B9", 43000000, 1050, false, "{\"borders\": [\"PRK\", \"JPN\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"KOR\"}"},
		{"Taiwan", "TWN", "#27AE60", 20000000, 920, true, "{\"borders\": [\"CHN\", \"PHL\", \"JPN\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"CHN\"}"},
		{"Brunei Darussalam", "BRN", "#F1C40F", 260000, 780, false, "{\"borders\": [\"MYS\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Timor-Leste", "TLS", "#D35400", 750000, 480, true, "{\"borders\": [\"IDN\", \"AUS\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"IDN\"}"},
		{"Kingdom of Bhutan", "BTN", "#E67E22", 550000, 440, false, "{\"borders\": [\"IND\", \"CHN\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"IND\"}"},
		{"Republic of Maldives", "MDV", "#1ABC9C", 220000, 460, true, "{\"borders\": [\"IND\", \"LKA\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Republic of Fiji", "FJI", "#3498DB", 730000, 480, true, "{\"borders\": [\"TON\", \"VUT\", \"NZL\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Solomon Islands", "SLB", "#27AE60", 320000, 420, true, "{\"borders\": [\"PNG\", \"VUT\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Republic of Vanuatu", "VUT", "#117864", 150000, 400, true, "{\"borders\": [\"SLB\", \"FJI\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Independent State of Samoa", "WSM", "#C0392B", 160000, 390, true, "{\"borders\": [\"TON\", \"FJI\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"NZL\"}"},
		{"Kingdom of Tonga", "TON", "#922B21", 95000, 380, true, "{\"borders\": [\"FJI\", \"WSM\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Federated States of Micronesia", "FSM", "#2980B9", 100000, 380, true, "{\"borders\": [\"PHL\", \"PNG\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"USA\"}"},
		{"State of Eritrea", "ERI", "#117864", 3000000, 480, false, "{\"borders\": [\"SDN\", \"ETH\", \"DJI\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ETH\"}"},
		{"Republic of South Sudan", "SSD", "#1E8449", 7500000, 580, false, "{\"borders\": [\"SDN\", \"ETH\", \"KEN\", \"UGA\", \"COD\", \"CAF\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"SDN\"}"},
		{"Gabonese Republic", "GAB", "#27AE60", 950000, 650, false, "{\"borders\": [\"GNQ\", \"CMR\", \"COG\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"FRA\"}"},
		{"Republic of Equatorial Guinea", "GNQ", "#D4AC0D", 400000, 620, false, "{\"borders\": [\"CMR\", \"GAB\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ESP\"}"},
		{"Republic of Djibouti", "DJI", "#2980B9", 500000, 450, false, "{\"borders\": [\"ERI\", \"ETH\", \"SOM\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"FRA\"}"},
		{"Islamic Republic of Mauritania", "MRT", "#16A085", 2000000, 490, false, "{\"borders\": [\"MAR\", \"ALG\", \"MLI\", \"SEN\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"FRA\"}"},
		{"Togolese Republic", "TGO", "#F39C12", 3500000, 440, false, "{\"borders\": [\"GHA\", \"BFA\", \"BEN\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"FRA\"}"},
		{"Republic of The Gambia", "GMB", "#C0392B", 900000, 380, false, "{\"borders\": [\"SEN\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Republic of Guinea-Bissau", "GNB", "#117864", 980000, 400, false, "{\"borders\": [\"SEN\", \"GIN\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"POR\"}"},
		{"Kingdom of Lesotho", "LSO", "#2980B9", 1600000, 420, false, "{\"borders\": [\"ZAF\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Kingdom of Eswatini", "SWZ", "#D35400", 850000, 430, false, "{\"borders\": [\"ZAF\", \"MOZ\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Republic of Mauritius", "MUS", "#D4AC0D", 1050000, 560, true, "{\"borders\": [\"MDG\", \"SYC\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Union of the Comoros", "COM", "#16A085", 460000, 360, true, "{\"borders\": [\"MOZ\", \"MDG\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"FRA\"}"},
		{"Republic of Cabo Verde", "CPV", "#2874A6", 360000, 410, true, "{\"borders\": [\"SEN\", \"MRT\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"POR\"}"},
		{"São Tomé and Príncipe", "STP", "#1E8449", 115000, 350, true, "{\"borders\": [\"GAB\", \"GNQ\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"POR\"}"},
		{"Republic of Seychelles", "SYC", "#E74C3C", 70000, 480, true, "{\"borders\": [\"MUS\", \"MDG\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Jamaica", "JAM", "#229954", 2400000, 520, true, "{\"borders\": [\"CUB\", \"HAI\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Republic of Trinidad and Tobago", "TTO", "#C0392B", 1250000, 620, true, "{\"borders\": [\"VEN_SA\", \"GRD\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Commonwealth of The Bahamas", "BHS", "#1ABC9C", 255000, 560, true, "{\"borders\": [\"USA\", \"CUB\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Barbados", "BRB", "#2980B9", 260000, 480, true, "{\"borders\": [\"VCT\", \"LCA\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Saint Lucia", "LCA", "#F1C40F", 140000, 420, true, "{\"borders\": [\"BRB\", \"VCT\", \"MTQ\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Saint Vincent and the Grenadines", "VCT", "#27AE60", 110000, 410, true, "{\"borders\": [\"LCA\", \"GRD\", \"BRB\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Grenada", "GRD", "#E67E22", 95000, 400, true, "{\"borders\": [\"VCT\", \"TTO\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Antigua and Barbuda", "ATG", "#C0392B", 65000, 420, true, "{\"borders\": [\"KNA\", \"GLP\", \"MSR\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Commonwealth of Dominica", "DMA", "#1E8449", 70000, 390, true, "{\"borders\": [\"GLP\", \"MTQ\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Saint Kitts and Nevis", "KNA", "#D4AC0D", 42000, 380, true, "{\"borders\": [\"ATG\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Belize", "BLZ", "#16A085", 185000, 420, false, "{\"borders\": [\"MEX\", \"GUA\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
		{"Republic of Iceland", "ISL", "#2980B9", 255000, 560, true, "{\"borders\": [\"NOR\", \"ENG\", \"CAN\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"DEN\"}"},
		{"Republic of Malta", "MLT", "#C0392B", 355000, 510, true, "{\"borders\": [\"ITA\", \"TUN\", \"LBY\"], \"birth_year\": 1989, \"unlock_era\": \"modern\", \"parent\": \"ENG\"}"},
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
	if DB == nil {
		return nil
	}
	_, err := DB.Exec("INSERT INTO game_states (game_date, data) VALUES ($1, $2)", gameDate, data)
	return err
}

func GetLatestGameState() (string, int64, error) {
	if DB == nil {
		return "", 0, errors.New("database not connected")
	}
	var data string
	var tick int64
	err := DB.QueryRow("SELECT data, tick FROM game_states ORDER BY id DESC LIMIT 1").Scan(&data, &tick)
	if err == sql.ErrNoRows {
		return "", 0, nil
	}
	return data, tick, err
}

type UserRecord struct {
	ID, Population                  int64
	Username, Password, Email, Role string
	IsActive                        bool
}

func GetUserByUsername(loginIdentifier string) (*UserRecord, error) {
	if DB == nil {
		return nil, nil
	}
	user := &UserRecord{}
	err := DB.QueryRow(`
		SELECT id, username, password, email, COALESCE(role, 'player'), is_active 
		FROM users 
		WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)
		LIMIT 1`, loginIdentifier).
		Scan(&user.ID, &user.Username, &user.Password, &user.Email, &user.Role, &user.IsActive)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if IsAdminIdentifier(user.Email) || IsAdminIdentifier(user.Username) {
		user.Role = "admin"
		go func(uid int64) {
			if DB != nil {
				_, _ = DB.Exec("UPDATE users SET role = 'admin' WHERE id = $1", uid)
			}
		}(user.ID)
	}
	return user, nil
}

func CreateUser(username, password, email, baseColor string) (int64, error) {
	if DB == nil {
		return 0, nil
	}
	role := "player"
	if IsAdminIdentifier(email) || IsAdminIdentifier(username) {
		role = "admin"
	}
	var id int64
	err := DB.QueryRow("INSERT INTO users (username, password, email, base_color, role) VALUES ($1, $2, $3, $4, $5) RETURNING id",
		username, password, email, baseColor, role).Scan(&id)
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
	if DB == nil {
		return nil, nil
	}
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
	if DB == nil {
		return nil, nil
	}
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
	if DB == nil {
		return nil, nil
	}
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

type AdminUserOverview struct {
	ID           int64      `json:"id"`
	Username     string     `json:"username"`
	Email        string     `json:"email"`
	Role         string     `json:"role"`
	IsActive     bool       `json:"is_active"`
	CreatedAt    time.Time  `json:"created_at"`
	LastLogin    *time.Time `json:"last_login"`
	CountryID    *int64     `json:"country_id"`
	CountryName  *string    `json:"country_name"`
	CountryCode  *string    `json:"country_code"`
	CountryColor *string    `json:"country_color"`
	Population   int64      `json:"population"`
	Resources    int64      `json:"resources"`
	Troops       int64      `json:"troops"`
	EconomyRate  float64    `json:"economy_rate"`
}

func GetAdminDashboardUsers() ([]AdminUserOverview, error) {
	if DB == nil {
		return nil, nil
	}
	rows, err := DB.Query(`
		SELECT 
			u.id, u.username, u.email, COALESCE(u.role, 'player') AS role, u.is_active, u.created_at, u.last_login,
			c.id, c.name, c.code, c.color, COALESCE(c.population, 0), COALESCE(c.resources, 0), COALESCE(c.troops, 0), COALESCE(c.economy_rate, 1.0)
		FROM users u
		LEFT JOIN player_countries pc ON pc.user_id = u.id AND pc.is_active = true
		LEFT JOIN countries c ON c.id = pc.country_id
		ORDER BY u.id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []AdminUserOverview
	for rows.Next() {
		var u AdminUserOverview
		var cid sql.NullInt64
		var cname, ccode, ccolor sql.NullString
		if err := rows.Scan(
			&u.ID, &u.Username, &u.Email, &u.Role, &u.IsActive, &u.CreatedAt, &u.LastLogin,
			&cid, &cname, &ccode, &ccolor, &u.Population, &u.Resources, &u.Troops, &u.EconomyRate,
		); err != nil {
			return nil, err
		}
		if cid.Valid {
			u.CountryID = &cid.Int64
		}
		if cname.Valid {
			u.CountryName = &cname.String
		}
		if ccode.Valid {
			u.CountryCode = &ccode.String
		}
		if ccolor.Valid {
			u.CountryColor = &ccolor.String
		}
		if IsAdminIdentifier(u.Email) || IsAdminIdentifier(u.Username) {
			u.Role = "admin"
		}
		result = append(result, u)
	}
	return result, rows.Err()
}
