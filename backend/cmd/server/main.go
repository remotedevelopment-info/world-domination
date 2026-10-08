package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"kingdom-conquest/backend/internal/database"
	"kingdom-conquest/backend/internal/game"
	"kingdom-conquest/backend/internal/handlers"
	"kingdom-conquest/backend/pkg/auth"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

func wsHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	engine := game.GetEngine()
	stateChan := engine.Subscribe()
	defer engine.Unsubscribe(stateChan)

	// Send initial state
	initialState := map[string]interface{}{
		"type":      "init",
		"tick":      engine.GetCurrentTick(),
		"timestamp": time.Now().Unix(),
	}
	if err := conn.WriteJSON(initialState); err != nil {
		return
	}

	// Listen for game state updates
	for {
		select {
		case state := <-stateChan:
			if err := conn.WriteJSON(state); err != nil {
				return
			}
		case <-time.After(30 * time.Second):
			// Send ping to keep connection alive
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "healthy",
		"time":   time.Now().Format(time.RFC3339),
	})
}

func setupRouter() *mux.Router {
	r := mux.NewRouter()

	// Public routes
	r.HandleFunc("/api/health", healthHandler).Methods("GET")
	r.HandleFunc("/api/register", handlers.RegisterHandler).Methods("POST")
	r.HandleFunc("/api/login", handlers.LoginHandler).Methods("POST")
	r.HandleFunc("/api/countries", handlers.GetCountriesHandler).Methods("GET")

	// Protected routes
	api := r.PathPrefix("/api").Subrouter()
	api.Use(auth.AuthMiddleware)
	api.HandleFunc("/logout", handlers.LogoutHandler).Methods("POST")
	api.HandleFunc("/assign-country", handlers.AssignCountryHandler).Methods("POST")
	api.HandleFunc("/my-country", handlers.GetPlayerCountryHandler).Methods("GET")
	api.HandleFunc("/heartbeat", handlers.HeartbeatHandler).Methods("POST")

	// WebSocket endpoint
	r.HandleFunc("/ws", wsHandler)

	// Serve static files
	r.PathPrefix("/").Handler(http.FileServer(http.Dir("../../frontend")))

	return r
}

func main() {
	port := flag.String("port", os.Getenv("PORT"), "Server port")
	if *port == "" {
		*port = "8080"
	}
	flag.Parse()

	// Initialize database
	if err := database.InitDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.CloseDB()

	if err := database.InitSchema(); err != nil {
		log.Fatalf("Failed to initialize schema: %v", err)
	}

	if err := database.SeedInitialData(); err != nil {
		log.Fatalf("Failed to seed initial data: %v", err)
	}

	// Start game engine
	engine := game.GetEngine()
	engine.Start()

	// Setup HTTP server
	router := setupRouter()
	server := &http.Server{
		Addr:         ":" + *port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		log.Println("Shutting down server...")
		engine.Stop()
		server.Close()
	}()

	log.Printf("Server starting on port %s", *port)
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
	log.Println("Server stopped")
}