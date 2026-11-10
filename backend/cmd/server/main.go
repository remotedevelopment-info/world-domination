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

	// Drain incoming control messages (pongs, close frames) in background
	go func() {
		defer conn.Close()
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				break
			}
		}
	}()

	engine := game.GetEngine()
	stateChan := engine.Subscribe()
	defer engine.Unsubscribe(stateChan)

	// Send the full current state so the client renders immediately.
	state := engine.BuildState()
	conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	if err := conn.WriteJSON(map[string]interface{}{
		"type":  "init",
		"state": state,
	}); err != nil {
		return
	}

	// Reusable ping ticker to prevent timer channel allocation leak
	pingTicker := time.NewTicker(25 * time.Second)
	defer pingTicker.Stop()

	// Listen for game state updates
	for {
		select {
		case state := <-stateChan:
			conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteJSON(state); err != nil {
				return
			}
		case <-pingTicker.C:
			// Send ping to keep connection alive
			conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
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

// frontendDir returns the first existing candidate for the frontend folder so
// the server works whether launched from the repo root or backend/.
func frontendDir() string {
	for _, candidate := range []string{"frontend", "../frontend", "../../frontend"} {
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate
		}
	}
	return "../frontend"
}

func setupRouter() *mux.Router {
	r := mux.NewRouter()

	// Public routes
	r.HandleFunc("/api/health", healthHandler).Methods("GET")
	r.HandleFunc("/api/register", handlers.RegisterHandler).Methods("POST")
	r.HandleFunc("/api/login", handlers.LoginHandler).Methods("POST")
	r.HandleFunc("/api/countries", handlers.GetCountriesHandler).Methods("GET")

	// Global timeline read endpoint (authoritative server clock, public)
	r.HandleFunc("/api/timeline", handlers.GetTimelineHandler).Methods("GET")

	// Protected routes
	api := r.PathPrefix("/api").Subrouter()
	api.Use(auth.AuthMiddleware)
	api.HandleFunc("/timeline/jump", handlers.JumpTimelineHandler).Methods("POST")
	api.HandleFunc("/timeline/scale", handlers.SetTimelineScaleHandler).Methods("POST")
	api.HandleFunc("/timeline/pause", handlers.SetTimelinePauseHandler).Methods("POST")
	api.HandleFunc("/admin/dashboard", handlers.GetAdminDashboardHandler).Methods("GET")
	api.HandleFunc("/admin/game-monitor", handlers.AdminGameMonitorHandler).Methods("GET")
	api.HandleFunc("/admin/scenario-tune", handlers.AdminScenarioTuneHandler).Methods("POST")
	api.HandleFunc("/admin/reset-game", handlers.AdminResetGameHandler).Methods("POST")
	api.HandleFunc("/logout", handlers.LogoutHandler).Methods("POST")
	api.HandleFunc("/assign-country", handlers.AssignCountryHandler).Methods("POST")
	api.HandleFunc("/my-country", handlers.GetPlayerCountryHandler).Methods("GET")
	api.HandleFunc("/heartbeat", handlers.HeartbeatHandler).Methods("POST")
	api.HandleFunc("/action", handlers.ActionHandler).Methods("POST")
	api.HandleFunc("/troops", handlers.GetTroopsHandler).Methods("GET")
	api.HandleFunc("/kingdom-detail", handlers.GetKingdomDetailHandler).Methods("GET")
	api.HandleFunc("/diplomacy", handlers.GetDiplomacyHandler).Methods("GET")
api.HandleFunc("/set-economy-rate", handlers.SetEconomyRateHandler).Methods("POST")

api.HandleFunc("/set-economy-settings", handlers.SetEconomySettingsHandler).Methods("POST")

	// WebSocket endpoint
	r.HandleFunc("/ws", wsHandler)

	// Serve static files from the frontend directory with no-cache headers
	// so development updates to ES modules reload reliably without stale browser cache.
	fileServer := http.FileServer(http.Dir(frontendDir()))
	r.PathPrefix("/").Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, must-revalidate")
		fileServer.ServeHTTP(w, r)
	}))

	return r
}

func main() {
	port := flag.String("port", os.Getenv("PORT"), "Server port")
	if *port == "" {
		*port = "8060"
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

	// Start game engine (date-based, real-time gameplay with authoritative timeline)
	engine := game.GetEngine()
	engine.Start()

	// Restore last persisted timeline and tick state across restarts
	if data, tick, err := database.GetLatestGameState(); err == nil && data != "" {
		var savedState game.GameState
		if err := json.Unmarshal([]byte(data), &savedState); err == nil {
			engine.ResumeState(tick, savedState.SimYear, savedState.ChronoScale, savedState.IsPaused)
			log.Printf("Resumed authoritative timeline at year %.2f (%s, scale %s)", savedState.SimYear, savedState.EraID, savedState.ChronoScale)
		}
	}

	// 1. Authoritative Timeline Ticker: ticks every 1 second based on active ChronoScale.
	go func() {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			engine.TickTimeline()
		}
	}()

	// 2. Economy simulation: one 15-second cycle per owned kingdom, broadcast to
	// all clients so the treasury dashboard constantly updates.
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			engine.TickEconomy()
		}
	}()

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
