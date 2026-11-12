package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

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
	Email    string `json:"email"`
	Role     string `json:"role"`
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

	token := auth.CreateToken(user.ID, user.Username, user.Email, user.Role)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(LoginResponse{
		Token:    token,
		UserID:   user.ID,
		Username: user.Username,
		Email:    user.Email,
		Role:     user.Role,
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
			"email":       user.Email,
		})
		return
	}

	resp := map[string]interface{}{
		"has_country":  true,
		"country_id":   country.CountryID,
		"country_name": country.Name,
		"country_code": country.Code,
		"owner_id":     user.UserID,
		"last_active":  country.LastActive,
		"email":        user.Email,
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

	targetCountryID := int64(0)
	if cidStr := r.URL.Query().Get("country_id"); cidStr != "" {
		if cid, err := strconv.ParseInt(cidStr, 10, 64); err == nil && cid > 0 {
			// Allow querying if owned by user or if admin
			isOwner, _ := database.IsCountryOwnedByUser(cid, user.UserID)
			isAdmin := user.Role == "admin" || database.IsAdminIdentifier(user.Email) || database.IsAdminIdentifier(user.Username)
			if isOwner || isAdmin {
				targetCountryID = cid
			}
		}
	}

	if targetCountryID == 0 {
		pc, err := database.GetPlayerCountry(user.UserID)
		if err != nil || pc == nil {
			http.Error(w, "No country assigned", http.StatusBadRequest)
			return
		}
		targetCountryID = pc.CountryID
	}

	detail, err := database.GetKingdomDetail(targetCountryID)
	if err != nil {
		http.Error(w, "Error fetching kingdom detail", http.StatusInternalServerError)
		return
	}

	simYear := game.GetEngine().GetSimYear()
	econ := game.ComputeEconomyFull(
		detail.Population, detail.Resources, detail.Troops,
		detail.EconomyRate, detail.Markets, detail.Infrastructure, detail.Investment, detail.SocialCosts,
		detail.TroopsLevy, detail.TroopsRegular, detail.TroopsElite,
		detail.EntrepreneurialPride, detail.MilitaryDelayedCosts, detail.ColonialYield, simYear,
		detail.TaxMod, detail.TradeMod,
	)
	game.PopulateLastYearLedger(
		&econ,
		detail.LastTaxRevenue, detail.LastMarketIncome, detail.LastMilitaryExp,
		detail.LastSocialExp, detail.LastInvestmentExp, detail.LastTotalExp,
		detail.LastBudgetBalance, detail.LastMigration,
	)
	detail.GDP = econ.GDP
	detail.CurrencyValue = econ.CurrencyValue
	detail.InflationRate = econ.InflationRate

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"country_id":            detail.CountryID,
		"name":                  detail.Name,
		"code":                  detail.Code,
		"population":            detail.Population,
		"resources":             detail.Resources,
		"troops":                detail.Troops,
		"troops_levy":           detail.TroopsLevy,
		"troops_regular":        detail.TroopsRegular,
		"troops_elite":          detail.TroopsElite,
		"fort_n":                detail.FortN,
		"fort_s":                detail.FortS,
		"fort_e":                detail.FortE,
		"fort_w":                detail.FortW,
		"central_troops":        detail.CentralTroops,
		"border_troops":         detail.BorderTroops,
		"economy_rate":          detail.EconomyRate,
		"investment":            detail.Investment,
		"social_costs":          detail.SocialCosts,
		"markets":               detail.Markets,
		"infrastructure":        detail.Infrastructure,
		"gdp":                   detail.GDP,
		"currency_value":        detail.CurrencyValue,
		"inflation_rate":        detail.InflationRate,
		"owner_name":            detail.OwnerName,
		"entrepreneurial_pride": detail.EntrepreneurialPride,
		"military_delayed_costs": detail.MilitaryDelayedCosts,
		"colonial_progress":     detail.ColonialProgress,
		"colonial_yield":        detail.ColonialYield,
		"colonial_fleets":       detail.ColonialFleets,
		"economy":               econ,
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
	ActionType      string `json:"action_type"`    // diplomacy, economy, military
	Type            string `json:"type,omitempty"` // alias for action_type
	Description     string `json:"description"`    // human-readable action label
	TargetCountryID *int64 `json:"target_country_id,omitempty"` // required for target-state actions
	Direction       string `json:"direction,omitempty"`   // N, S, E, W, or 0-360 (interior movement)
	Speed           string `json:"speed,omitempty"`       // Slow, Fast (interior movement)
	MovementType    string `json:"movement_type,omitempty"` // interior, target
	TroopTier       string `json:"troop_tier,omitempty"`    // levy, regular, elite, drill
	TroopCount      *int64 `json:"troop_count,omitempty"`   // optional batch count (default 10)
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

	actionType := strings.ToLower(strings.TrimSpace(req.ActionType))
	if actionType == "" {
		actionType = strings.ToLower(strings.TrimSpace(req.Type))
	}
	engine := game.GetEngine()

	switch actionType {
	case "economy", "economic":
		actionType = "economy"
		if err := handleEconomy(user.UserID, req.Description, req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	case "diplomacy", "diplomatic":
		actionType = "diplomacy"
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

	countries, err := database.GetCountries("medieval")
	if err != nil {
		return err
	}
	selfIdx, targetIdx := -1, -1
	for i := range countries {
		if countries[i].ID == pc.CountryID {
			selfIdx = i
		}
		if req.TargetCountryID != nil && countries[i].ID == *req.TargetCountryID {
			targetIdx = i
		}
	}
	if selfIdx < 0 {
		return errors.New("country not found")
	}
	self := countries[selfIdx]

	// Each economy action has a distinct, rate-aware effect on the treasury
	// or the kingdom's development levels; all are visible in the broadcast
	// that follows the action.
	switch description {
	case "Collect Taxes":
		// One cycle of rate-aware tax revenue, straight into the treasury.
		econ := game.ComputeEconomy(self.Population, self.Resources, self.Troops, self.EconomyRate, self.Markets, self.Infrastructure, self.Investment, self.SocialCosts)
		gain := econ.TaxRevenue
		if gain < 1 {
			gain = 1
		}
		if err := database.UpdateCountryResources(self.ID, self.Resources+gain); err != nil {
			return err
		}
	case "Trade Resources":
		if req.TargetCountryID == nil || *req.TargetCountryID == 0 {
			return errors.New("target country required for Trade Resources")
		}
		if *req.TargetCountryID == pc.CountryID {
			return errors.New("cannot target own country for Trade Resources")
		}
		if targetIdx < 0 {
			return errors.New("target country not found")
		}
		target := countries[targetIdx]
		const amount = 50
		if self.Resources < amount {
			return fmt.Errorf("insufficient resources: trade requires %d, treasury holds %d", amount, self.Resources)
		}
		if err := database.UpdateCountryResources(self.ID, self.Resources-amount); err != nil {
			return err
		}
		if err := database.UpdateCountryResources(target.ID, target.Resources+amount); err != nil {
			return err
		}
	case "Build Market":
		const cost = 200
		if self.Resources < cost {
			return fmt.Errorf("building a market costs %d resources, treasury holds %d", cost, self.Resources)
		}
		if err := database.UpdateCountryResources(self.ID, self.Resources-cost); err != nil {
			return err
		}
		if err := database.IncrementEconomyLevel(self.ID, "markets", 1); err != nil {
			return err
		}
	case "Invest in Infrastructure":
		const cost = 150
		if self.Resources < cost {
			return fmt.Errorf("infrastructure investment costs %d resources, treasury holds %d", cost, self.Resources)
		}
		if err := database.UpdateCountryResources(self.ID, self.Resources-cost); err != nil {
			return err
		}
		if err := database.IncrementEconomyLevel(self.ID, "infrastructure", 1); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unknown economy action %q", description)
	}

	if err := database.LogAction(userID, pc.CountryID, "economy", description,
		req.TargetCountryID, req.Direction, req.Speed, req.MovementType); err != nil {
		return err
	}
	return nil
}

// handleDiplomacy logs a diplomacy action (e.g. envoy, alliance, war).
// All diplomacy options require a target state (another country) and require paying diplomatic tribute/costs.
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

	countries, err := database.GetCountries("medieval")
	if err != nil {
		return err
	}
	var self *models.Country
	for i := range countries {
		if countries[i].ID == pc.CountryID {
			self = &countries[i]
			break
		}
	}
	if self == nil {
		return errors.New("player country not found")
	}

	// Diplomatic missions require tributes, emissary allowances, or war mobilization levies:
	// - Sending an envoy requires 50 gold tribute/travel expenses
	// - Proposing an alliance requires 75 gold treaty gifts
	// - Declaring war requires 100 gold mobilization costs
	tributeCost := int64(50)
	lowerDesc := strings.ToLower(desc)
	if strings.Contains(lowerDesc, "alliance") {
		tributeCost = 75
	} else if strings.Contains(lowerDesc, "war") {
		tributeCost = 100
	}

	if self.Resources < tributeCost {
		return fmt.Errorf("insufficient gold reserve to dispatch diplomatic mission (%d required for %s, have %d)", tributeCost, desc, self.Resources)
	}

	if err := database.UpdateCountryResources(self.ID, self.Resources-tributeCost); err != nil {
		return err
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
	case "Train Troops", "Drill & Promote":
		req.TroopTier = "drill"
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

// handleMilitaryRecruit recruits or trains/promotes troops across layered military tiers.
func handleMilitaryRecruit(userID int64, pc *models.PlayerCountry, req ActionRequest) error {
	country, err := database.GetKingdomDetail(pc.CountryID)
	if err != nil || country == nil {
		return errors.New("country not found")
	}

	tier := strings.ToLower(strings.TrimSpace(req.TroopTier))
	if tier == "" {
		tier = "levy" // default entry tier
	}

	batchCount := int64(10)
	if req.TroopCount != nil && *req.TroopCount > 0 {
		batchCount = *req.TroopCount
	}

	// Population pressure: high population makes military recruitment less expensive (up to 50% discount)
	manpowerDiscount := math.Max(0.50, 1.0-(float64(country.Population)/20000000.0)*0.50)

	switch tier {
	case "levy", "conscript", "militia":
		// Levy: base 150 gold per 10 troops
		cost := int64(math.Round(float64((batchCount/10)*150) * manpowerDiscount))
		if cost < 50 {
			cost = 50
		}
		if country.Resources < cost {
			return fmt.Errorf("insufficient resources in treasury: levying %d recruits requires %d gold, treasury holds %d", batchCount, cost, country.Resources)
		}
		newResources := country.Resources - cost
		newLevy := country.TroopsLevy + batchCount
		if err := database.UpdateCountryResources(pc.CountryID, newResources); err != nil {
			return err
		}
		if err := database.UpdateCountryTroopLayers(pc.CountryID, newLevy, country.TroopsRegular, country.TroopsElite); err != nil {
			return err
		}
		// Delayed effect: commits ongoing delayed liabilities (quartermaster supply lines & munition debt)
		_ = database.AddMilitaryDelayedCost(pc.CountryID, int64(math.Round(float64(cost)*0.25)))
		return database.LogAction(userID, pc.CountryID, "military",
			fmt.Sprintf("levied %d raw conscripts (-%d gold from treasury, delayed tail committed)", batchCount, cost),
			req.TargetCountryID, req.Direction, req.Speed, req.MovementType)

	case "regular", "line", "footmen":
		// Regulars: base 450 gold per 10 troops
		cost := int64(math.Round(float64((batchCount/10)*450) * manpowerDiscount))
		if cost < 150 {
			cost = 150
		}
		if country.Resources < cost {
			return fmt.Errorf("insufficient resources in treasury: recruiting %d line regulars requires %d gold, treasury holds %d", batchCount, cost, country.Resources)
		}
		newResources := country.Resources - cost
		newRegular := country.TroopsRegular + batchCount
		if err := database.UpdateCountryResources(pc.CountryID, newResources); err != nil {
			return err
		}
		if err := database.UpdateCountryTroopLayers(pc.CountryID, country.TroopsLevy, newRegular, country.TroopsElite); err != nil {
			return err
		}
		_ = database.AddMilitaryDelayedCost(pc.CountryID, int64(math.Round(float64(cost)*0.25)))
		return database.LogAction(userID, pc.CountryID, "military",
			fmt.Sprintf("enlisted %d disciplined line regulars (-%d gold from treasury, delayed tail committed)", batchCount, cost),
			req.TargetCountryID, req.Direction, req.Speed, req.MovementType)

	case "elite", "guard", "knights", "veteran":
		// Elite Guard: base 1,200 gold per 10 troops
		cost := int64(math.Round(float64((batchCount/10)*1200) * manpowerDiscount))
		if cost < 400 {
			cost = 400
		}
		if country.Resources < cost {
			return fmt.Errorf("insufficient resources in treasury: commissioning %d royal elite guards requires %d gold, treasury holds %d", batchCount, cost, country.Resources)
		}
		newResources := country.Resources - cost
		newElite := country.TroopsElite + batchCount
		if err := database.UpdateCountryResources(pc.CountryID, newResources); err != nil {
			return err
		}
		if err := database.UpdateCountryTroopLayers(pc.CountryID, country.TroopsLevy, country.TroopsRegular, newElite); err != nil {
			return err
		}
		_ = database.AddMilitaryDelayedCost(pc.CountryID, int64(math.Round(float64(cost)*0.25)))
		return database.LogAction(userID, pc.CountryID, "military",
			fmt.Sprintf("commissioned %d elite royal guards (-%d gold from treasury, delayed tail committed)", batchCount, cost),
			req.TargetCountryID, req.Direction, req.Speed, req.MovementType)

	case "drill", "promote", "train":
		return handleMilitaryDrillAndPromote(userID, pc, country)

	default:
		return fmt.Errorf("unknown troop layer %q (valid layers: levy, regular, elite, drill)", tier)
	}
}

// handleMilitaryDrillAndPromote trains troops into higher ranks over time.
func handleMilitaryDrillAndPromote(userID int64, pc *models.PlayerCountry, country *database.KingdomDetailRow) error {
	cost := int64(300)
	if country.Resources < cost {
		return fmt.Errorf("insufficient resources: drilling and promoting troops requires %d gold, treasury holds %d", cost, country.Resources)
	}

	if country.TroopsLevy >= 10 {
		// Drill 10 Levies into 10 Line Regulars
		newLevy := country.TroopsLevy - 10
		newRegular := country.TroopsRegular + 10
		newResources := country.Resources - cost
		if err := database.UpdateCountryResources(pc.CountryID, newResources); err != nil {
			return err
		}
		if err := database.UpdateCountryTroopLayers(pc.CountryID, newLevy, newRegular, country.TroopsElite); err != nil {
			return err
		}
		return database.LogAction(userID, pc.CountryID, "military",
			"drilled and promoted 10 raw levies into disciplined line regulars (-300 gold)",
			nil, "", "", "")
	} else if country.TroopsRegular >= 5 {
		// Promote 5 Battle-Tested Regulars into 5 Elite Imperial Veterans
		newRegular := country.TroopsRegular - 5
		newElite := country.TroopsElite + 5
		newResources := country.Resources - cost
		if err := database.UpdateCountryResources(pc.CountryID, newResources); err != nil {
			return err
		}
		if err := database.UpdateCountryTroopLayers(pc.CountryID, country.TroopsLevy, newRegular, newElite); err != nil {
			return err
		}
		return database.LogAction(userID, pc.CountryID, "military",
			"promoted 5 battle-tested regulars to elite imperial veterans (-300 gold)",
			nil, "", "", "")
	} else {
		return errors.New("no troops eligible for drill and promotion; recruit at least 10 levies or 5 line regulars first")
	}
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

// handleMilitaryFortify fortifies an owned frontier, deducting high construction costs and upgrading defenses.
func handleMilitaryFortify(userID int64, pc *models.PlayerCountry, req ActionRequest) error {
	if req.TargetCountryID != nil && *req.TargetCountryID != 0 {
		return errors.New("target country not allowed for fortify borders")
	}
	direction := strings.ToUpper(strings.TrimSpace(req.Direction))
	if direction == "" {
		return errors.New("border side required for fortify borders (N, S, E, or W)")
	}
	side := directionToBorderSide(direction)
	if side != "N" && side != "S" && side != "E" && side != "W" {
		return fmt.Errorf("invalid border side %q (must be N, S, E, or W)", direction)
	}

	detail, err := database.GetKingdomDetail(pc.CountryID)
	if err != nil || detail == nil {
		return errors.New("country not found")
	}

	var currentTier int64
	switch side {
	case "N":
		currentTier = detail.FortN
	case "S":
		currentTier = detail.FortS
	case "E":
		currentTier = detail.FortE
	case "W":
		currentTier = detail.FortW
	}

	// Cost scales heavily by tier: Tier 1 = 500 D, Tier 2 = 1,000 D, Tier 3 = 1,500 D, etc.
	cost := int64(500) * (currentTier + 1)
	if detail.Resources < cost {
		return fmt.Errorf("insufficient resources in treasury: constructing Tier %d fortification on %s frontier requires %d gold, treasury holds %d", currentTier+1, side, cost, detail.Resources)
	}

	newTier, err := database.UpgradeBorderFortification(pc.CountryID, side, cost)
	if err != nil {
		return err
	}

	// Deploy a stationed defensive garrison on this fortified frontier
	_, _ = database.DB.Exec(
		`INSERT INTO troop_deployments (user_id, country_id, border_side, direction, speed, strength, deployed_at, updated_at)
		 VALUES ($1, $2, $3, $4, 'Stationary', 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		 ON CONFLICT DO NOTHING`,
		userID, pc.CountryID, side, side)

	return database.LogAction(userID, pc.CountryID, "military",
		fmt.Sprintf("constructed Tier %d frontier fortification on %s border (-%d gold)", newTier, side, cost),
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

	// Broadcast immediately so every client's economy dashboard reflects the
	// new rate (and its knock-on effects) without waiting for the next tick.
	game.GetEngine().Advance()

	// Return updated kingdom detail
	detail, err := database.GetKingdomDetail(pc.CountryID)
	if err != nil {
		http.Error(w, "Error fetching updated detail", http.StatusInternalServerError)
		return
	}

	econ := game.ComputeEconomy(detail.Population, detail.Resources, detail.Troops, detail.EconomyRate, detail.Markets, detail.Infrastructure, detail.Investment, detail.SocialCosts)
	detail.GDP = econ.GDP
	detail.CurrencyValue = econ.CurrencyValue
	detail.InflationRate = econ.InflationRate

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"country_id":     detail.CountryID,
		"name":           detail.Name,
		"code":           detail.Code,
		"economy_rate":   detail.EconomyRate,
		"gdp":            detail.GDP,
		"currency_value": detail.CurrencyValue,
		"inflation_rate": detail.InflationRate,
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


// SetEconomySettingsHandler persists the tax rate, investment, and social-cost
// sliders for a country and broadcasts the resulting economy state. All levers
// persist, so their effect on future economic periods is automatic on the next
// tick.
func SetEconomySettingsHandler(w http.ResponseWriter, r *http.Request) {
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
		EconomyRate *int64 `json:"economy_rate"`
		TaxRate     *int64 `json:"tax_rate"`
		Investment  int64  `json:"investment"`
		SocialCosts int64  `json:"social_costs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	econRate := int64(50)
	if req.EconomyRate != nil {
		econRate = *req.EconomyRate
	} else if req.TaxRate != nil {
		econRate = *req.TaxRate
	}

	oldSettings, errSettings := database.GetEconomySettings(pc.CountryID)
	detail, err := database.GetKingdomDetail(pc.CountryID)
	if err != nil || detail == nil {
		http.Error(w, "Error fetching kingdom detail", http.StatusInternalServerError)
		return
	}

	simYear := game.GetEngine().GetSimYear()

	// Solvency validation: Check whether gold reserves are adequate to support the declared expedition spending
	// In the Modern Age (1989+), deficit financing and sovereign debt are permitted.
	// In pre-modern eras (1500-1988), gold reserves must support the multi-year production commitment.
	allowed, maxAffordable, requiredGold, reason := game.CheckExpeditionAffordability(detail.Resources, req.Investment, simYear)
	if !allowed {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":                     reason,
			"required_gold":             requiredGold,
			"current_resources":         detail.Resources,
			"max_affordable_investment": maxAffordable,
		})
		return
	}

	// Announce commitment when raising planned investment dial
	if errSettings == nil && req.Investment > oldSettings.PlannedInvestment {
		annualCost := int64(math.Round(game.GetEraExpeditionCostPerPct(simYear) * float64(req.Investment)))
		gestation := game.GetColonialGestationYears(simYear)
		portName := game.RealmPort(detail.Code, detail.Name)
		isLandlocked := database.IsLandlockedRealm(detail.Code)
		var msg string
		if isLandlocked {
			msg = fmt.Sprintf("🚂 Royal Exchequer appropriates %d gold ducats per annum over %.1f years for overland transport corridors in %s.", annualCost, gestation, portName)
		} else {
			msg = fmt.Sprintf("⚓ Royal Exchequer appropriates %d gold ducats per annum over %.1f years to outfit overseas expeditions in %s.", annualCost, gestation, portName)
		}
		_ = database.LogAction(user.UserID, pc.CountryID, "news", msg, nil, "", "", "")
	}

	err = database.SetPlannedEconomySettings(pc.CountryID, econRate, req.Investment, req.SocialCosts)
	if err != nil {
		http.Error(w, "Error setting planned economy appropriations", http.StatusInternalServerError)
		return
	}

	// Broadcast immediately so connected clients observe the updated planned settings
	game.GetEngine().Advance()

	// Return the updated settings and derived economy
	settings, err := database.GetEconomySettings(pc.CountryID)
	if err != nil {
		http.Error(w, "Error fetching updated settings", http.StatusInternalServerError)
		return
	}

	econ := game.ComputeEconomyFull(
		detail.Population, detail.Resources, detail.Troops,
		settings.EconomyRate, detail.Markets, detail.Infrastructure, settings.Investment, settings.SocialCosts,
		detail.TroopsLevy, detail.TroopsRegular, detail.TroopsElite,
		detail.EntrepreneurialPride, detail.MilitaryDelayedCosts, detail.ColonialYield, simYear,
		detail.TaxMod, detail.TradeMod,
	)
	game.PopulateLastYearLedger(
		&econ,
		detail.LastTaxRevenue, detail.LastMarketIncome, detail.LastMilitaryExp,
		detail.LastSocialExp, detail.LastInvestmentExp, detail.LastTotalExp,
		detail.LastBudgetBalance, detail.LastMigration,
	)
	detail.GDP = econ.GDP
	detail.CurrencyValue = econ.CurrencyValue
	detail.InflationRate = econ.InflationRate

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"country_id":           detail.CountryID,
		"name":                 detail.Name,
		"code":                 detail.Code,
		"resources":            detail.Resources,
		"economy_rate":         settings.EconomyRate,
		"investment":           settings.Investment,
		"social_costs":         settings.SocialCosts,
		"planned_economy_rate": settings.PlannedEconomyRate,
		"planned_investment":   settings.PlannedInvestment,
		"planned_social_costs": settings.PlannedSocialCosts,
		"colonial_progress":    detail.ColonialProgress,
		"colonial_yield":       detail.ColonialYield,
		"colonial_fleets":      detail.ColonialFleets,
		"gdp":                  detail.GDP,
		"currency_value":       detail.CurrencyValue,
		"inflation_rate":       detail.InflationRate,
		"budget_balance":       econ.BudgetBalance,
		"effective_balance":    econ.EffectiveBalance,
		"economy":              econ,
	})
}

const NominatedTimelineAdminEmail = "admin@sfsw.net"

// checkTimelineAdmin ensures the caller is authenticated as the designated administrator.
func checkTimelineAdmin(r *http.Request) (*auth.Token, error) {
	user := auth.GetUserFromContext(r)
	if user == nil {
		return nil, errors.New("authentication required: please log in")
	}
	if user.Role == "admin" || database.IsAdminIdentifier(user.Email) || database.IsAdminIdentifier(user.Username) {
		return user, nil
	}
	return nil, errors.New("forbidden: administrator privileges required")
}

// GetAdminDashboardHandler returns telemetry for all users, claimed realms, resources, and live timeline.
func GetAdminDashboardHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	admin, err := checkTimelineAdmin(r)
	if err != nil {
		status := http.StatusForbidden
		if strings.Contains(err.Error(), "authentication required") {
			status = http.StatusUnauthorized
		}
		writeJSONError(w, status, err.Error())
		return
	}

	users, err := database.GetAdminDashboardUsers()
	if err != nil {
		log.Printf("Error fetching admin dashboard users: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to load dashboard telemetry")
		return
	}

	engine := game.GetEngine()
	simYear, yearInt, era, scale, isPaused := engine.GetTimeline()
	state := engine.BuildState()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"admin_user":  admin.Username,
		"admin_email": admin.Email,
		"admin_role":  admin.Role,
		"timeline": map[string]interface{}{
			"sim_year":     simYear,
			"year_int":     yearInt,
			"era_id":       era.ID,
			"era_name":     era.Name,
			"chrono_scale": scale,
			"is_paused":    isPaused,
			"tick":         state.Tick,
		},
		"users":              users,
		"total_countries":    len(state.Countries),
		"expedition_pricing": game.GetExpeditionPricingTable(),
	})
}

type AdminResetGameRequest struct {
	Confirmation string `json:"confirmation"`
	ClearClaims  *bool  `json:"clear_claims"`
}

// AdminResetGameHandler handles the protected 3-stage game reset action.
// Requires admin authorization, exact verification phrase match, and rewinds
// the game to the Year 1500 base date while resetting all players and countries.
func AdminResetGameHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	admin, err := checkTimelineAdmin(r)
	if err != nil {
		status := http.StatusForbidden
		if strings.Contains(err.Error(), "authentication required") {
			status = http.StatusUnauthorized
		}
		writeJSONError(w, status, err.Error())
		return
	}

	var req AdminResetGameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	// Require exact confirmation code for stage 2/3 protection
	expectedKey := "RESET WORLD 1500"
	if strings.TrimSpace(strings.ToUpper(req.Confirmation)) != expectedKey {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("Invalid confirmation key: must type exact string '%s'", expectedKey))
		return
	}

	clearClaims := true
	if req.ClearClaims != nil {
		clearClaims = *req.ClearClaims
	}

	engine := game.GetEngine()
	state, err := engine.ResetToYear1500(clearClaims)
	if err != nil {
		log.Printf("Error resetting game to Year 1500: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to execute world reset: "+err.Error())
		return
	}

	log.Printf("CRITICAL: Master game reset to Year 1500 executed by admin %s (%s). ClearClaims: %v",
		admin.Username, admin.Email, clearClaims)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"message":      "Game successfully reset to Year 1500 base date and all players restored to initial values.",
		"sim_year":     1500.0,
		"era_id":       "discovery",
		"clear_claims": clearClaims,
		"tick":         state.Tick,
	})
}

// GetExpeditionPricingHandler returns the configured era expedition pricing matrix.
func GetExpeditionPricingHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	pricing := game.GetExpeditionPricingTable()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"pricing": pricing,
	})
}

// UpdateExpeditionPricingRequest models the batch update payload for era expedition pricing.
type UpdateExpeditionPricingRequest struct {
	Pricing []game.EraPricingConfig `json:"pricing"`
}

// UpdateExpeditionPricingHandler updates the expedition pricing matrix and broadcasts new state.
func UpdateExpeditionPricingHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	admin, err := checkTimelineAdmin(r)
	if err != nil {
		status := http.StatusForbidden
		if strings.Contains(err.Error(), "authentication required") {
			status = http.StatusUnauthorized
		}
		writeJSONError(w, status, err.Error())
		return
	}

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "Failed to read request body")
		return
	}

	var pricingList []game.EraPricingConfig
	var wrapped UpdateExpeditionPricingRequest
	if err := json.Unmarshal(bodyBytes, &wrapped); err == nil && len(wrapped.Pricing) > 0 {
		pricingList = wrapped.Pricing
	} else if err := json.Unmarshal(bodyBytes, &pricingList); err != nil || len(pricingList) == 0 {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload: expected pricing array or object with 'pricing' field")
		return
	}

	for i := range pricingList {
		p := &pricingList[i]
		if p.EraKey == "" && p.EraID != "" {
			p.EraKey = p.EraID
		}
		if p.EraID == "" && p.EraKey != "" {
			p.EraID = p.EraKey
		}
		if p.CostPerPct <= 0 {
			writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("Cost per %% for %s must be positive", p.EraKey))
			return
		}
		if p.GestationYears <= 0 {
			writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("Gestation duration for %s must be positive", p.EraKey))
			return
		}
		if err := database.UpdateExpeditionEraPricing(p.EraKey, p.CostPerPct, p.GestationYears, p.YieldBonus); err != nil {
			log.Printf("Error persisting era expedition pricing for %s: %v", p.EraKey, err)
		}
	}

	game.SetExpeditionPricingTable(pricingList)
	game.GetEngine().Advance()

	log.Printf("Admin %s (%s) updated expedition pricing table across %d eras", admin.Username, admin.Email, len(pricingList))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Expedition pricing table updated successfully across all historical eras.",
		"pricing": game.GetExpeditionPricingTable(),
	})
}

// GetTimelineHandler returns the current authoritative game timeline telemetry.
func GetTimelineHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	engine := game.GetEngine()
	simYear, yearInt, era, scale, isPaused := engine.GetTimeline()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"sim_year":       simYear,
		"year_int":       yearInt,
		"era_id":         era.ID,
		"era_name":       era.Name,
		"chrono_scale":   scale,
		"is_paused":      isPaused,
		"timestamp":      time.Now().UTC().Format(time.RFC3339),
		"server_time_ms": time.Now().UnixMilli(),
		"admin_email":    NominatedTimelineAdminEmail,
	})
}

// JumpTimelineHandler sets the global authoritative game year and broadcasts immediately.
// Restricted to the designated timeline administrator (nalex@sfsw.net).
func JumpTimelineHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	user, err := checkTimelineAdmin(r)
	if err != nil {
		status := http.StatusForbidden
		if strings.Contains(err.Error(), "authentication required") {
			status = http.StatusUnauthorized
		}
		writeJSONError(w, status, err.Error())
		return
	}

	var targetYear float64
	yearStr := r.URL.Query().Get("year")
	if yearStr != "" {
		if y, err := strconv.ParseFloat(yearStr, 64); err == nil {
			targetYear = y
		}
	}
	if targetYear == 0 {
		var req struct {
			Year float64 `json:"year"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil && req.Year > 0 {
			targetYear = req.Year
		}
	}

	if targetYear < 1500 || targetYear > 9999 {
		http.Error(w, "Year must be between 1500 and 9999", http.StatusBadRequest)
		return
	}

	engine := game.GetEngine()
	var state game.GameState
	if targetYear <= 1500.01 {
		// Jumping back to Year 1500 (Age of Discovery baseline) restores all realms
		// to authentic baseline starting demographics, military=0, and trade/vitals=0,
		// while preserving player kingdom assignments and the capex pricing matrix.
		var err error
		state, err = engine.ResetToYear1500(false)
		if err != nil {
			log.Printf("Error resetting to 1500 on timeline jump: %v", err)
			state = engine.SetSimYear(1500.0)
		}
	} else {
		state = engine.SetSimYear(targetYear)
	}

	if err := database.SaveGameState(time.Now(), state.JSON()); err != nil {
		log.Printf("Error saving jumped game state snapshot: %v", err)
	}
	log.Printf("Timeline jumped to year %.2f (%s) by admin %s", state.SimYear, state.EraName, user.Email)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":      "Timeline year updated successfully",
		"sim_year":     state.SimYear,
		"year_int":     state.YearInt,
		"era_id":       state.EraID,
		"era_name":     state.EraName,
		"chrono_scale": state.ChronoScale,
		"is_paused":    state.IsPaused,
	})
}

// SetTimelineScaleHandler updates the global chrono scale and broadcasts immediately.
// Restricted to the designated timeline administrator (nalex@sfsw.net).
func SetTimelineScaleHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	user, err := checkTimelineAdmin(r)
	if err != nil {
		status := http.StatusForbidden
		if strings.Contains(err.Error(), "authentication required") {
			status = http.StatusUnauthorized
		}
		writeJSONError(w, status, err.Error())
		return
	}

	scaleStr := r.URL.Query().Get("scale")
	if scaleStr == "" {
		var req struct {
			Scale string `json:"scale"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil && req.Scale != "" {
			scaleStr = req.Scale
		}
	}

	if scaleStr == "" {
		http.Error(w, "Scale is required", http.StatusBadRequest)
		return
	}

	engine := game.GetEngine()
	state := engine.SetChronoScale(scaleStr)
	if err := database.SaveGameState(time.Now(), state.JSON()); err != nil {
		log.Printf("Error saving scaled game state snapshot: %v", err)
	}
	log.Printf("Timeline scale set to %s by admin %s", state.ChronoScale, user.Email)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":      "Chrono scale updated successfully",
		"chrono_scale": state.ChronoScale,
		"sim_year":     state.SimYear,
		"year_int":     state.YearInt,
		"era_id":       state.EraID,
	})
}

// SetTimelinePauseHandler pauses or resumes the global timeline ticker.
// Restricted to the designated timeline administrator (nalex@sfsw.net).
func SetTimelinePauseHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	user, err := checkTimelineAdmin(r)
	if err != nil {
		status := http.StatusForbidden
		if strings.Contains(err.Error(), "authentication required") {
			status = http.StatusUnauthorized
		}
		writeJSONError(w, status, err.Error())
		return
	}

	var paused bool
	pausedStr := r.URL.Query().Get("paused")
	if pausedStr != "" {
		if p, err := strconv.ParseBool(pausedStr); err == nil {
			paused = p
		}
	} else {
		var req struct {
			Paused bool `json:"paused"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			paused = req.Paused
		}
	}

	engine := game.GetEngine()
	state := engine.SetTimelinePaused(paused)
	if err := database.SaveGameState(time.Now(), state.JSON()); err != nil {
		log.Printf("Error saving paused game state snapshot: %v", err)
	}
	log.Printf("Timeline pause state set to %v by admin %s", state.IsPaused, user.Email)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":   "Timeline pause state updated successfully",
		"is_paused": state.IsPaused,
		"sim_year":  state.SimYear,
		"year_int":  state.YearInt,
	})
}

// AdminGameMonitorHandler returns real-time telemetry categorized into the 5 core game variable classes:
// 1. User Setting (policy dials)
// 2. User State (hidden/intangible variables: entrepreneurial pride, delayed military liabilities, fiscal stress)
// 3. Game State (environmental and common macro factors)
// 4. Seasonal & Climatic (Milankovitch cycles, Little Ice Age, harvest yields, winter logistics)
// 5. Population Pressure (manpower recruitment discount vs welfare squalor burden)
func AdminGameMonitorHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	_, err := checkTimelineAdmin(r)
	if err != nil {
		status := http.StatusForbidden
		if strings.Contains(err.Error(), "authentication required") {
			status = http.StatusUnauthorized
		}
		writeJSONError(w, status, err.Error())
		return
	}

	engine := game.GetEngine()
	simYear := engine.GetSimYear()
	seasonState := game.GetClimaticAndSeasonalState(simYear)

	countries, err := database.GetCountries("medieval")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to load countries: "+err.Error())
		return
	}

	activeWars, _ := database.GetActiveWars()
	if activeWars == nil {
		activeWars = make(map[int64]bool)
	}

	var globalPopulation int64
	var globalTreasury int64
	var globalTradeLiquidity int64

	type KingdomMonitorEntry struct {
		CountryID          int64                  `json:"country_id"`
		Name               string                 `json:"name"`
		Code               string                 `json:"code"`
		Color              string                 `json:"color"`
		OwnerName          *string                `json:"owner_name"`
		UserSettings       map[string]interface{} `json:"user_settings"`
		UserState          map[string]interface{} `json:"user_state"`
		SeasonalImpact     map[string]interface{} `json:"seasonal_impact"`
		PopulationPressure map[string]interface{} `json:"population_pressure"`
	}

	kingdomEntries := make([]KingdomMonitorEntry, 0)

	for _, c := range countries {
		globalPopulation += c.Population
		globalTreasury += c.Resources
		globalTradeLiquidity += c.Markets * 24

		econ := game.ComputeEconomyFull(
			c.Population, c.Resources, c.Troops,
			c.EconomyRate, c.Markets, c.Infrastructure, c.Investment, c.SocialCosts,
			c.TroopsLevy, c.TroopsRegular, c.TroopsElite,
			c.EntrepreneurialPride, c.MilitaryDelayedCosts, c.ColonialYield, simYear,
			c.TaxMod, c.TradeMod,
		)

		// Fiscal stress index: debt/deficit severity, reserve exhaustion, tax drag
		fiscalStress := 0.0
		if econ.BudgetBalance < 0 {
			if c.Resources > 0 {
				fiscalStress = math.Min(100.0, (float64(-econ.BudgetBalance)/float64(c.Resources+1))*50.0)
			} else {
				fiscalStress = 95.0 // Treasury exhausted
			}
		}
		if c.EconomyRate > 60 {
			fiscalStress = math.Min(100.0, fiscalStress+float64(c.EconomyRate-60)*1.2)
		}

		userSettings := map[string]interface{}{
			"tax_rate":       c.EconomyRate,
			"investment":     c.Investment,
			"social_costs":   c.SocialCosts,
			"central_troops": c.Troops,
			"troops_levy":    c.TroopsLevy,
			"troops_regular": c.TroopsRegular,
			"troops_elite":   c.TroopsElite,
			"fort_n":         c.FortN,
			"fort_s":         c.FortS,
			"fort_e":         c.FortE,
			"fort_w":         c.FortW,
			"markets":        c.Markets,
			"infrastructure": c.Infrastructure,
		}

		userState := map[string]interface{}{
			"entrepreneurial_pride":  econ.EntrepreneurialPride,
			"military_delayed_costs": econ.MilitaryDelayedCosts,
			"resources":              c.Resources,
			"gdp":                    econ.GDP,
			"tax_revenue":            econ.TaxRevenue,
			"market_revenue":         econ.MarketRevenue,
			"total_revenue":          econ.TotalRevenue,
			"military_upkeep":        econ.MilitaryUpkeep,
			"social_expenditure":     econ.SocialExpenditure,
			"investment_expenditure": econ.InvestmentExpenditure,
			"effective_total_exp":    econ.EffectiveTotalExp,
			"effective_balance":      econ.EffectiveBalance,
			"deficit_capped":         econ.DeficitCapped,
			"fiscal_regime":          econ.FiscalRegime,
			"currency_value":         econ.CurrencyValue,
			"inflation_rate":         econ.InflationRate,
			"fiscal_stress_index":    math.Round(fiscalStress*10) / 10,
			"wealth_factor":          econ.WealthFactor,
			"wealthy_ratio":          econ.WealthyRatio,
			"wealthy_migration":      econ.WealthyMigration,
			"general_migration":      econ.GeneralMigration,
			"capital_flight_drain":  econ.CapitalFlightDrain,
			"migration_status":       econ.MigrationStatus,
			"colonial_progress":     c.ColonialProgress,
			"colonial_yield":        c.ColonialYield,
			"colonial_fleets":       c.ColonialFleets,
		}

		seasonalImpact := map[string]interface{}{
			"season":                    seasonState.Season,
			"season_name":               seasonState.SeasonName,
			"harvest_yield_factor":      seasonState.HarvestYieldFactor,
			"winter_severity_modifier":  seasonState.WinterSeverity,
			"commercial_trade_velocity": seasonState.CommercialVelocity,
			"little_ice_age_phase":      seasonState.LittleIceAgePhase,
		}

		popGrowth := game.PopulationGrowth(c.Population, c.EconomyRate, c.Markets, c.Infrastructure, c.Investment, c.SocialCosts)
		workforce := c.Population - c.Troops
		if workforce < 0 {
			workforce = 0
		}

		popPressureMap := map[string]interface{}{
			"population":                    c.Population,
			"workforce":                     workforce,
			"population_pressure_index":     econ.PopulationPressure,
			"manpower_recruitment_discount": math.Round(econ.ManpowerRecruitDiscount*1000) / 1000,
			"welfare_squalor_burden":        econ.WelfareSqualorBurden,
			"birth_growth_annual":           popGrowth,
			"net_migration_annual":          econ.NetMigration,
		}

		kingdomEntries = append(kingdomEntries, KingdomMonitorEntry{
			CountryID:          c.ID,
			Name:               c.Name,
			Code:               c.Code,
			Color:              c.Color,
			OwnerName:          c.OwnerName,
			UserSettings:       userSettings,
			UserState:          userState,
			SeasonalImpact:     seasonalImpact,
			PopulationPressure: popPressureMap,
		})
	}

	activeWarsCount := 0
	for _, atWar := range activeWars {
		if atWar {
			activeWarsCount++
		}
	}

	gameState := map[string]interface{}{
		"authoritative_era":      engine.GetCurrentEra(),
		"sim_year":               simYear,
		"chrono_scale":           engine.GetChronoScale(),
		"is_paused":              engine.IsPaused(),
		"active_wars_count":      activeWarsCount,
		"global_population":      globalPopulation,
		"global_treasury_gold":   globalTreasury,
		"global_trade_liquidity": globalTradeLiquidity,
		"macro_fiscal_regime":    "Layer 1: Hard-Specie Specie Regime",
	}

	era := engine.GetCurrentEra()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"timestamp":    time.Now().Unix(),
		"sim_year":     simYear,
		"era":          era.Name,
		"chrono_scale": engine.GetChronoScale(),
		"is_paused":    engine.IsPaused(),
		"seasonal_climatic": map[string]interface{}{
			"season":                           seasonState.Season,
			"season_name":                      seasonState.SeasonName,
			"little_ice_age_phase":             seasonState.LittleIceAgePhase,
			"is_little_ice_age":                strings.Contains(seasonState.LittleIceAgePhase, "Minimum"),
			"harvest_yield_factor":             seasonState.HarvestYieldFactor,
			"winter_logistics_modifier":        seasonState.WinterSeverity,
			"commercial_velocity":              seasonState.CommercialVelocity,
			"milankovitch_eccentricity_factor": 1.0 + seasonState.MilankovitchFactor,
			"orbital_forcing_description":      fmt.Sprintf("Milankovitch Variance %+.3f", seasonState.MilankovitchFactor),
		},
		"global_macro_metrics": map[string]interface{}{
			"total_realms":                   len(kingdomEntries),
			"total_world_population":         globalPopulation,
			"total_global_treasury":          globalTreasury,
			"total_mobilized_armies":         globalTradeLiquidity,
			"global_carrying_capacity":       int64(3000000000),
			"world_carrying_capacity_stress": math.Round((float64(globalPopulation)/3000000000.0)*1000) / 1000,
		},
		"game_state":     gameState,
		"seasonal_state": seasonState,
		"kingdoms":       kingdomEntries,
	})
}

// AdminScenarioTuneHandler allows administrators to inject scenario states
// (e.g. setting entrepreneurial pride, delayed military liabilities, or gold reserves) for testing.
func AdminScenarioTuneHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	user, err := checkTimelineAdmin(r)
	if err != nil {
		status := http.StatusForbidden
		if strings.Contains(err.Error(), "authentication required") {
			status = http.StatusUnauthorized
		}
		writeJSONError(w, status, err.Error())
		return
	}

	var raw struct {
		CountryID            interface{} `json:"country_id"`
		CountryCode          string      `json:"country_code"`
		Preset               string      `json:"preset"`
		TaxRate              *int64      `json:"tax_rate"`
		Investment           *int64      `json:"investment"`
		SocialCosts          *int64      `json:"social_costs"`
		EntrepreneurialPride *float64    `json:"entrepreneurial_pride"`
		MilitaryDelayedCosts *int64      `json:"military_delayed_costs"`
		Resources            *int64      `json:"resources"`
		Population           *int64      `json:"population"`
	}

	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	var targetCountryID int64
	switch v := raw.CountryID.(type) {
	case float64:
		targetCountryID = int64(v)
	case int64:
		targetCountryID = v
	case string:
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			targetCountryID = id
		} else if raw.CountryCode == "" {
			raw.CountryCode = v
		}
	}

	if targetCountryID <= 0 && raw.CountryCode != "" {
		all, _ := database.GetCountries("medieval")
		for _, c := range all {
			if strings.EqualFold(c.Code, raw.CountryCode) || strings.EqualFold(c.Name, raw.CountryCode) {
				targetCountryID = c.ID
				break
			}
		}
	}

	if targetCountryID <= 0 {
		writeJSONError(w, http.StatusBadRequest, "Missing or invalid country_id/country_code")
		return
	}

	country, err := database.GetKingdomDetail(targetCountryID)
	if err != nil || country == nil {
		writeJSONError(w, http.StatusNotFound, "Country not found")
		return
	}

	pride := country.EntrepreneurialPride
	delayedCosts := country.MilitaryDelayedCosts
	resources := country.Resources
	population := country.Population
	taxRate := country.EconomyRate
	inv := country.Investment
	soc := country.SocialCosts

	if raw.Preset != "" {
		switch strings.ToLower(raw.Preset) {
		case "debt_shock":
			pride = 25.0
			delayedCosts += 50000
			if resources > 5000 {
				resources = 5000
			}
		case "golden_age":
			pride = 100.0
			delayedCosts = 0
			resources += 20000
		case "severe_winter":
			pride = 60.0
			delayedCosts += 15000
		}
	}

	if raw.EntrepreneurialPride != nil {
		pride = *raw.EntrepreneurialPride
	}
	if raw.MilitaryDelayedCosts != nil {
		delayedCosts = *raw.MilitaryDelayedCosts
	}
	if raw.Resources != nil {
		resources = *raw.Resources
	}
	if raw.Population != nil {
		population = *raw.Population
	}
	if raw.TaxRate != nil {
		taxRate = *raw.TaxRate
	}
	if raw.Investment != nil {
		inv = *raw.Investment
	}
	if raw.SocialCosts != nil {
		soc = *raw.SocialCosts
	}

	if err := database.SetEconomySettings(targetCountryID, taxRate, inv, soc); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to update economy settings: "+err.Error())
		return
	}
	if err := database.UpdateCountryResources(targetCountryID, resources); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to update resources: "+err.Error())
		return
	}
	if err := database.UpdateCountryInternalMetrics(targetCountryID, pride, delayedCosts); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to update internal metrics: "+err.Error())
		return
	}

	game.GetEngine().Advance()
	log.Printf("Admin %s tuned scenario for country %d: Tax=%d, Pride=%.1f, Delayed=%d, Res=%d",
		user.Email, targetCountryID, taxRate, pride, delayedCosts, resources)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":                "Scenario variables updated successfully",
		"country_id":             targetCountryID,
		"country_name":           country.Name,
		"country_code":           country.Code,
		"entrepreneurial_pride":  pride,
		"military_delayed_costs": delayedCosts,
		"resources":              resources,
		"population":             population,
		"tax_rate":               taxRate,
		"investment":             inv,
		"social_costs":           soc,
	})
}
