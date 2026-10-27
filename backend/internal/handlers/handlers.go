package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"

	"kingdom-conquest/backend/internal/database"
	"kingdom-conquest/backend/internal/game"
	"kingdom-conquest/backend/internal/models"
	"kingdom-conquest/backend/pkg/auth"
)

type RegisterRequest struct {
	Username  string `json:"username"`
	Password  string `json:"password"`
	Email     string `json:"email"`
	BaseColor string `json:"base_color"` // Player's base colour for owned territories
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token    string `json:"token"`
	UserID   int64  `json:"user_id"`
	Username string `json:"username"`
}

// writeJSONError sends a consistent JSON error payload so the frontend can
// always surface a readable message.
func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// validateRegistration returns a user-facing message when the registration
// payload is invalid, or an empty string when it passes.
func validateRegistration(req RegisterRequest) string {
	if req.Username == "" || req.Password == "" || req.Email == "" {
		return "Username, password, and email are required"
	}
	if len(req.Username) < 3 || len(req.Username) > 32 {
		return "Username must be between 3 and 32 characters"
	}
	// bcrypt rejects passwords longer than 72 bytes, so cap the input here
	// to return a clear message instead of a generic 500.
	if len(req.Password) < 6 || len(req.Password) > 72 {
		return "Password must be between 6 and 72 characters"
	}
	if len(req.Email) > 255 || !strings.Contains(req.Email, "@") ||
		strings.HasPrefix(req.Email, "@") || strings.HasSuffix(req.Email, "@") {
		return "Please enter a valid email address"
	}
	return ""
}

func RegisterHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(req.Email)

	if msg := validateRegistration(req); msg != "" {
		writeJSONError(w, http.StatusBadRequest, msg)
		return
	}

	hashedPassword, err := auth.HashPassword(req.Password)
	if err != nil {
		log.Printf("register: hashing password: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Error processing password")
		return
	}

	userID, err := database.CreateUser(req.Username, hashedPassword, req.Email, req.BaseColor)
	if err != nil {
		if errors.Is(err, database.ErrUserExists) {
			writeJSONError(w, http.StatusConflict, "Username or email already exists")
			return
		}
		log.Printf("register: creating user: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Could not create your account. Please try again.")
		return
	}

	log.Printf("register: created user %q (id=%d)", req.Username, userID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"user_id":  userID,
		"username": req.Username,
		"message":  "Registration successful",
	})
}

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	req.Username = strings.TrimSpace(req.Username)

	user, err := database.GetUserByUsername(req.Username)
	if err != nil || user == nil {
		log.Printf("login: unknown user %q", req.Username)
		writeJSONError(w, http.StatusUnauthorized, "Invalid username or password")
		return
	}

	if !auth.CheckPasswordHash(req.Password, user.Password) {
		log.Printf("login: bad password for %q", req.Username)
		writeJSONError(w, http.StatusUnauthorized, "Invalid username or password")
		return
	}

	if !user.IsActive {
		writeJSONError(w, http.StatusForbidden, "Account is inactive. Contact an administrator.")
		return
	}

	database.UpdateUserLastLogin(user.ID)

	token := auth.CreateToken(user.ID, user.Username)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(LoginResponse{
		Token:    token,
		UserID:   user.ID,
		Username: user.Username,
	})
}

func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		token := authHeader[7:] // Remove "Bearer " prefix
		auth.RevokeToken(token)
	}
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Logged out successfully"})
}

func GetCountriesHandler(w http.ResponseWriter, r *http.Request) {
	era := r.URL.Query().Get("era")
	if era == "" {
		era = "medieval"
	}

	countries, err := database.GetCountries(era)
	if err != nil {
		http.Error(w, "Error fetching countries", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(countries)
}

func AssignCountryHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	user := auth.GetUserFromContext(r)
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	countryIDStr := r.URL.Query().Get("country_id")
	countryID, err := strconv.ParseInt(countryIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid country_id", http.StatusBadRequest)
		return
	}

	if err := database.ClaimCountry(user.UserID, countryID); err != nil {
		log.Printf("claim: user %d country %d failed: %v", user.UserID, countryID, err)
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}

	database.UpdatePlayerActivity(user.UserID)

	log.Printf("claim: user %d country %d ok", user.UserID, countryID)
	// A claim changes the world: rebuild state and broadcast immediately.
	game.GetEngine().Advance()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Country assigned successfully",
	})
}

func GetPlayerCountryHandler(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUserFromContext(r)
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	country, err := database.GetPlayerCountry(user.UserID)
	if err != nil {
		http.Error(w, "Error fetching country", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if country == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"has_country": false,
		})
		return
	}

	resp := map[string]interface{}{
		"has_country":  true,
		"country_id":   country.CountryID,
		"country_name": country.Name,
		"last_active":  country.LastActive,
	}
	json.NewEncoder(w).Encode(resp)
}

// GetTroopsHandler returns the troop deployment state for a country.
// Response: { central: number, borders: { N, S, E, W } }
func GetTroopsHandler(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUserFromContext(r)
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	pc, err := database.GetPlayerCountry(user.UserID)
	if err != nil || pc == nil {
		http.Error(w, "No country assigned", http.StatusBadRequest)
		return
	}

	countryID := pc.CountryID
	central, borders, err := database.GetTroops(countryID)
	if err != nil {
		http.Error(w, "Error fetching troops", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"country_id": countryID,
		"central":    central,
		"borders":    borders,
	})
}

// GetKingdomDetailHandler returns consolidated command-center data for the
// player's owned kingdom.
// Response: { country_id, name, code, population, resources, troops,
//   central_troops, border_troops: {N,S,E,W}, owner_name }
func GetKingdomDetailHandler(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUserFromContext(r)
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	pc, err := database.GetPlayerCountry(user.UserID)
	if err != nil || pc == nil {
		http.Error(w, "No country assigned", http.StatusBadRequest)
		return
	}

	detail, err := database.GetKingdomDetail(pc.CountryID)
	if err != nil {
		http.Error(w, "Error fetching kingdom detail", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"country_id":     detail.CountryID,
		"name":           detail.Name,
		"code":           detail.Code,
		"population":     detail.Population,
		"resources":      detail.Resources,
		"troops":         detail.Troops,
		"central_troops": detail.CentralTroops,
		"border_troops":  detail.BorderTroops,
		"owner_name":     detail.OwnerName,
	})
}

// GetDiplomacyHandler returns diplomatic relations for the player's kingdom.
// Response: [{ target_country_id, target_name, action_type, description, game_date }]
func GetDiplomacyHandler(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUserFromContext(r)
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	pc, err := database.GetPlayerCountry(user.UserID)
	if err != nil || pc == nil {
		http.Error(w, "No country assigned", http.StatusBadRequest)
		return
	}

	relations, err := database.GetDiplomaticRelations(pc.CountryID)
	if err != nil {
		http.Error(w, "Error fetching diplomatic relations", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(relations)
}

// ActionRequest carries one real-time action.
type ActionRequest struct {
	ActionType    string `json:"action_type"`    // diplomacy, economy, military
	Description   string `json:"description"`    // human-readable action label
	TargetCountryID *int64 `json:"target_country_id,omitempty"` // required for target-state actions
	Direction     string `json:"direction,omitempty"`   // N, S, E, W, or 0-360 (interior movement)
	Speed         string `json:"speed,omitempty"`       // Slow, Fast (interior movement)
	MovementType  string `json:"movement_type,omitempty"` // interior, target
}

// ActionHandler handles diplomacy / economy / military actions. Each action
// is processed synchronously and the engine immediately broadcasts the new
// state to connected clients (real-time, not turn-based).
func ActionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	user := auth.GetUserFromContext(r)
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req ActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	actionType := strings.ToLower(req.ActionType)
	engine := game.GetEngine()

	switch actionType {
	case "economy":
		if err := handleEconomy(user.UserID, req.Description, req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	case "diplomacy":
		if err := handleDiplomacy(user.UserID, req.Description, req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	case "military":
		if err := handleMilitary(user.UserID, req.Description, req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	default:
		http.Error(w, "Unknown action_type; expected diplomacy, economy, or military", http.StatusBadRequest)
		return
	}

	if err := database.UpdatePlayerActivity(user.UserID); err != nil {
		log.Printf("error updating activity: %v", err)
	}
	state := engine.Advance()

	// Resolve the acting player's current kingdom from the freshly built
	// state so the client can update its own panel in a single round-trip
	// (AJAX-style) instead of waiting for the WebSocket broadcast or a page
	// refresh.
	var myCountryID, myPopulation, myResources int64
	var myCountryName string
	for _, p := range state.Players {
		if p.UserID == user.UserID {
			myCountryID = p.CountryID
			break
		}
	}
	for _, c := range state.Countries {
		if c.ID == myCountryID {
			myCountryName = c.Name
			myPopulation = c.Population
			myResources = c.Resources
			break
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":      "Action recorded",
		"type":         actionType,
		"game_date":    state.GameDate.Format("2006-01-02T15:04:05Z07:00"),
		"country_id":   myCountryID,
		"country_name": myCountryName,
		"population":   myPopulation,
		"resources":    myResources,
	})
}

// handleEconomy applies a tax/market action to the player's kingdom.
func handleEconomy(userID int64, description string, req ActionRequest) error {
	pc, err := database.GetPlayerCountry(userID)
	if err != nil || pc == nil {
		return errors.New("no country assigned")
	}
	// Trade Resources requires a target country; other economy actions do not.
	if description == "Trade Resources" {
		if req.TargetCountryID == nil || *req.TargetCountryID == 0 {
			return errors.New("target country required for Trade Resources")
		}
		if *req.TargetCountryID == pc.CountryID {
			return errors.New("cannot target own country for Trade Resources")
		}
	}
	countries, err := database.GetCountries("medieval")
	if err != nil {
		return err
	}
	var population, resources int64
	for _, c := range countries {
		if c.ID == pc.CountryID {
			population, resources = c.Population, c.Resources
			break
		}
	}
	tax := population / 1000
	if tax < 1 {
		tax = 1
	}
	if err := database.UpdateCountryResources(pc.CountryID, resources+tax); err != nil {
		return err
	}
	if err := database.LogAction(userID, pc.CountryID, "economy", description,
		req.TargetCountryID, req.Direction, req.Speed, req.MovementType); err != nil {
		return err
	}
	return nil
}

// handleDiplomacy logs a diplomacy action (e.g. envoy).
// All diplomacy options require a target state (another country).
func handleDiplomacy(userID int64, description string, req ActionRequest) error {
	pc, err := database.GetPlayerCountry(userID)
	if err != nil || pc == nil {
		return errors.New("no country assigned")
	}
	// Diplomacy always requires a target country.
	if req.TargetCountryID == nil || *req.TargetCountryID == 0 {
		return errors.New("target country required for diplomacy action")
	}
	if *req.TargetCountryID == pc.CountryID {
		return errors.New("cannot target own country for diplomacy action")
	}
	desc := description
	if desc == "" {
		desc = "sent envoy"
	}
	return database.LogAction(userID, pc.CountryID, "diplomacy", desc,
		req.TargetCountryID, req.Direction, req.Speed, req.MovementType)
}

// handleMilitary applies a recruitment/movement action to the player's kingdom.
// Military actions have mixed target requirements:
//   - Recruit Troops: no target, interior movement
//   - Move Army: interior (direction+speed) OR target (target_country_id)
//   - Fortify Borders: no target, interior movement
//   - Scout Enemy: target country required
func handleMilitary(userID int64, description string, req ActionRequest) error {
	pc, err := database.GetPlayerCountry(userID)
	if err != nil || pc == nil {
		return errors.New("no country assigned")
	}

	switch description {
	case "Recruit Troops":
		return handleMilitaryRecruit(userID, pc, req)
	case "Move Army":
		return handleMilitaryMove(userID, pc, req)
	case "Fortify Borders":
		return handleMilitaryFortify(userID, pc, req)
	case "Scout Enemy":
		return handleMilitaryScout(userID, pc, req)
	default:
		return handleMilitaryRecruit(userID, pc, req)
	}
}

// handleMilitaryRecruit recruits troops within the player's own kingdom.
// Recruited troops accumulate at a central location in the country.
func handleMilitaryRecruit(userID int64, pc *models.PlayerCountry, req ActionRequest) error {
	countries, err := database.GetCountries("medieval")
	if err != nil {
		return err
	}
	var population, resources, troops int64
	for _, c := range countries {
		if c.ID == pc.CountryID {
			population, resources, troops = c.Population, c.Resources, c.Troops
			break
		}
	}
	cost := population / 100
	if cost < 1 {
		cost = 1
	}
	if resources < cost {
		return errors.New("insufficient resources to recruit")
	}
	population += 10
	resources -= cost
	troops += 10 // Recruited troops accumulate at central location
	if err := database.UpdateCountryResources(pc.CountryID, resources); err != nil {
		return err
	}
	if err := database.UpdateCountryPopulation(pc.CountryID, population); err != nil {
		return err
	}
	if err := database.UpdateCountryTroops(pc.CountryID, troops); err != nil {
		return err
	}
	return database.LogAction(userID, pc.CountryID, "military", "recruited troops ("+strconv.FormatInt(cost, 10)+" resources, +10 population)",
		req.TargetCountryID, req.Direction, req.Speed, req.MovementType)
}

// handleMilitaryMove moves troops either interior (guard a border) or toward a target.
func handleMilitaryMove(userID int64, pc *models.PlayerCountry, req ActionRequest) error {
	movementType := req.MovementType
	if movementType == "" {
		// Infer movement type from what was provided.
		if req.TargetCountryID != nil && *req.TargetCountryID != 0 {
			movementType = "target"
		} else if req.Direction != "" && req.Speed != "" {
			movementType = "interior"
		}
	}

	if movementType == "interior" {
		// Interior movement: direction + speed required, no target country.
		if req.Direction == "" || req.Speed == "" {
			return errors.New("direction and speed required for interior army movement")
		}
		if req.TargetCountryID != nil && *req.TargetCountryID != 0 {
			return errors.New("target country not allowed for interior movement")
		}
		// Persist troop deployment to the specified border side.
		borderSide := directionToBorderSide(req.Direction)
		strength := 10 // Each Move Army action deploys 10 troops
		if _, err := database.DB.Exec(
			`INSERT INTO troop_deployments (user_id, country_id, border_side, direction, speed, strength, deployed_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			 ON CONFLICT DO NOTHING`,
			userID, pc.CountryID, borderSide, req.Direction, req.Speed, strength); err != nil {
			return err
		}
	} else if movementType == "target" {
		// Target movement: target country required.
		if req.TargetCountryID == nil || *req.TargetCountryID == 0 {
			return errors.New("target country required for target army movement")
		}
		if *req.TargetCountryID == pc.CountryID {
			return errors.New("cannot target own country for army movement")
		}
		if req.Direction != "" || req.Speed != "" {
			return errors.New("direction and speed not allowed for target movement")
		}
	} else {
		return errors.New("either target country or direction+speed required for Move Army")
	}
	return database.LogAction(userID, pc.CountryID, "military", "moved army",
		req.TargetCountryID, req.Direction, req.Speed, req.MovementType)
}

// directionToBorderSide converts a compass direction or degrees to a border side.
func directionToBorderSide(direction string) string {
	switch direction {
	case "N":
		return "N"
	case "S":
		return "S"
	case "E":
		return "E"
	case "W":
		return "W"
	default:
		// Try to parse as degrees (0-360) and map to nearest cardinal direction.
		var deg float64
		if _, err := fmt.Sscanf(direction, "%f", &deg); err == nil {
			// Normalize to 0-360
			deg = math.Mod(deg, 360)
			if deg < 0 {
				deg += 360
			}
			switch {
			case deg >= 337.5 || deg < 22.5:
				return "N"
			case deg >= 22.5 && deg < 67.5:
				return "E"
			case deg >= 67.5 && deg < 112.5:
				return "S"
			case deg >= 112.5 && deg < 157.5:
				return "E" // SE -> closest side; keeping simple cardinal
			case deg >= 157.5 && deg < 202.5:
				return "S"
			case deg >= 202.5 && deg < 247.5:
				return "W"
			case deg >= 247.5 && deg < 292.5:
				return "W"
			case deg >= 292.5 && deg < 337.5:
				return "N"
			}
		}
		return "N" // Default fallback
	}
}

// handleMilitaryFortify fortifies an owned border side.
func handleMilitaryFortify(userID int64, pc *models.PlayerCountry, req ActionRequest) error {
	if req.TargetCountryID != nil && *req.TargetCountryID != 0 {
		return errors.New("target country not allowed for fortify borders")
	}
	if req.Direction == "" {
		return errors.New("border side required for fortify borders")
	}
	return database.LogAction(userID, pc.CountryID, "military", "fortified borders",
		req.TargetCountryID, req.Direction, req.Speed, req.MovementType)
}

// handleMilitaryScout scouts an enemy country.
func handleMilitaryScout(userID int64, pc *models.PlayerCountry, req ActionRequest) error {
	if req.TargetCountryID == nil || *req.TargetCountryID == 0 {
		return errors.New("target country required for scout enemy")
	}
	if *req.TargetCountryID == pc.CountryID {
		return errors.New("cannot target own country for scout enemy")
	}
	return database.LogAction(userID, pc.CountryID, "military", "scouted enemy",
		req.TargetCountryID, req.Direction, req.Speed, req.MovementType)
}

func SetEconomyRateHandler(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUserFromContext(r)
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	pc, err := database.GetPlayerCountry(user.UserID)
	if err != nil || pc == nil {
		http.Error(w, "No country assigned", http.StatusBadRequest)
		return
	}

	var req struct {
		EconomyRate int64 `json:"economy_rate"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	err = database.SetEconomyRate(pc.CountryID, req.EconomyRate)
	if err != nil {
		http.Error(w, "Error setting economy rate", http.StatusInternalServerError)
		return
	}

	// Return updated kingdom detail
	detail, err := database.GetKingdomDetail(pc.CountryID)
	if err != nil {
		http.Error(w, "Error fetching updated detail", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"country_id": detail.CountryID,
		"name":       detail.Name,
		"code":       detail.Code,
		"economy_rate": detail.EconomyRate,
	})
}

func HeartbeatHandler(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUserFromContext(r)
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	database.UpdatePlayerActivity(user.UserID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "active",
	})
}
