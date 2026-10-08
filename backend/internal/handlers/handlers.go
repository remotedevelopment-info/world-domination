package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"kingdom-conquest/backend/internal/database"
	"kingdom-conquest/backend/pkg/auth"
)

type RegisterRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Email    string `json:"email"`
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

func RegisterHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Username == "" || req.Password == "" || req.Email == "" {
		http.Error(w, "Username, password, and email are required", http.StatusBadRequest)
		return
	}

	hashedPassword, err := auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, "Error processing password", http.StatusInternalServerError)
		return
	}

	userID, err := database.CreateUser(req.Username, hashedPassword, req.Email)
	if err != nil {
		http.Error(w, "Username or email already exists", http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"user_id":  userID,
		"username": req.Username,
		"message":  "Registration successful",
	})
}

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	user, err := database.GetUserByUsername(req.Username)
	if err != nil || user == nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	if !auth.CheckPasswordHash(req.Password, user.Password) {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	if !user.IsActive {
		http.Error(w, "Account is inactive", http.StatusForbidden)
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

	existing, err := database.GetPlayerCountry(user.UserID)
	if err != nil {
		http.Error(w, "Error checking assignment", http.StatusInternalServerError)
		return
	}
	if existing != nil {
		http.Error(w, "You already have a country assigned", http.StatusConflict)
		return
	}

	if err := database.AssignCountryToPlayer(user.UserID, countryID); err != nil {
		http.Error(w, "Error assigning country", http.StatusInternalServerError)
		return
	}

	database.UpdatePlayerActivity(user.UserID)

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

	country["has_country"] = true
	json.NewEncoder(w).Encode(country)
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