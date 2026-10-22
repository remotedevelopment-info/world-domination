package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"kingdom-conquest/backend/internal/database"
	"kingdom-conquest/backend/internal/game"
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

// ActionRequest carries one real-time action.
type ActionRequest struct {
	ActionType  string `json:"action_type"`
	Description string `json:"description"`
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
		if err := handleEconomy(user.UserID, req.Description); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	case "diplomacy":
		if err := handleDiplomacy(user.UserID, req.Description); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	case "military":
		if err := handleMilitary(user.UserID, req.Description); err != nil {
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
func handleEconomy(userID int64, description string) error {
	pc, err := database.GetPlayerCountry(userID)
	if err != nil || pc == nil {
		return errors.New("no country assigned")
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
	if err := database.LogAction(userID, pc.CountryID, "economy", "collected taxes ("+strconv.FormatInt(tax, 10)+" resources)"); err != nil {
		return err
	}
	return nil
}

// handleDiplomacy logs a diplomacy action (e.g. envoy).
func handleDiplomacy(userID int64, description string) error {
	pc, err := database.GetPlayerCountry(userID)
	if err != nil || pc == nil {
		return errors.New("no country assigned")
	}
	desc := description
	if desc == "" {
		desc = "sent envoy"
	}
	return database.LogAction(userID, pc.CountryID, "diplomacy", desc)
}

// handleMilitary applies a recruitment action to the player's kingdom.
func handleMilitary(userID int64, description string) error {
	pc, err := database.GetPlayerCountry(userID)
	if err != nil || pc == nil {
		return errors.New("no country assigned")
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
	cost := population / 100
	if cost < 1 {
		cost = 1
	}
	if resources < cost {
		return errors.New("insufficient resources to recruit")
	}
	population += 10
	resources -= cost
	if err := database.UpdateCountryResources(pc.CountryID, resources); err != nil {
		return err
	}
	if err := database.UpdateCountryPopulation(pc.CountryID, population); err != nil {
		return err
	}
	return database.LogAction(userID, pc.CountryID, "military", "recruited troops ("+strconv.FormatInt(cost, 10)+" resources, +10 population)")
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
