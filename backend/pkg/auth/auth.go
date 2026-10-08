package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type Token struct {
	UserID   int64     `json:"user_id"`
	Username string    `json:"username"`
	Expiry   time.Time `json:"expiry"`
}

type TokenStore struct {
	tokens map[string]*Token
	mu     sync.RWMutex
}

var store = &TokenStore{tokens: make(map[string]*Token)}

const tokenExpiry = 24 * time.Hour

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 14)
	return string(bytes), err
}

func CheckPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

func GenerateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}

func CreateToken(userID int64, username string) string {
	token := GenerateToken()
	store.mu.Lock()
	defer store.mu.Unlock()
	store.tokens[token] = &Token{
		UserID:   userID,
		Username: username,
		Expiry:   time.Now().Add(tokenExpiry),
	}
	return token
}

func ValidateToken(tokenString string) (*Token, bool) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	token, exists := store.tokens[tokenString]
	if !exists {
		return nil, false
	}
	if time.Now().After(token.Expiry) {
		delete(store.tokens, tokenString)
		return nil, false
	}
	return token, true
}

func RevokeToken(tokenString string) {
	store.mu.Lock()
	defer store.mu.Unlock()
	delete(store.tokens, tokenString)
}

func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Missing authorization header", http.StatusUnauthorized)
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, "Invalid authorization format", http.StatusUnauthorized)
			return
		}

		token, valid := ValidateToken(parts[1])
		if !valid {
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), "user", token)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetUserFromContext(r *http.Request) *Token {
	token, _ := r.Context().Value("user").(*Token)
	return token
}