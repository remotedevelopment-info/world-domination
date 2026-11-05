package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"kingdom-conquest/backend/internal/game"
	"kingdom-conquest/backend/pkg/auth"
)

func TestValidateRegistration(t *testing.T) {
	tests := []struct {
		name     string
		req      RegisterRequest
		expected string
	}{
		{
			name: "valid request",
			req: RegisterRequest{
				Username: "testking",
				Password: "password123",
				Email:    "test@example.com",
			},
			expected: "",
		},
		{
			name: "missing username",
			req: RegisterRequest{
				Username: "",
				Password: "password123",
				Email:    "test@example.com",
			},
			expected: "Username, password, and email are required",
		},
		{
			name: "username too short",
			req: RegisterRequest{
				Username: "ab",
				Password: "password123",
				Email:    "test@example.com",
			},
			expected: "Username must be between 3 and 32 characters",
		},
		{
			name: "password too short",
			req: RegisterRequest{
				Username: "testking",
				Password: "12345",
				Email:    "test@example.com",
			},
			expected: "Password must be between 6 and 72 characters",
		},
		{
			name: "invalid email without @",
			req: RegisterRequest{
				Username: "testking",
				Password: "password123",
				Email:    "invalid-email",
			},
			expected: "Please enter a valid email address",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := validateRegistration(tt.req)
			if got != tt.expected {
				t.Errorf("validateRegistration() = %q, expected %q", got, tt.expected)
			}
		})
	}
}

func TestTimelineHandlers(t *testing.T) {
	engine := game.GetEngine()
	engine.Start()

	// 1. GET /api/timeline (Public)
	req := httptest.NewRequest(http.MethodGet, "/api/timeline", nil)
	rr := httptest.NewRecorder()
	GetTimelineHandler(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GetTimelineHandler status = %d, expected 200", rr.Code)
	}

	var res map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("Failed to parse GET /api/timeline response: %v", err)
	}
	if _, ok := res["sim_year"]; !ok {
		t.Fatalf("Expected sim_year in timeline response")
	}
	if res["admin_email"] != NominatedTimelineAdminEmail {
		t.Errorf("Expected admin_email %s, got %v", NominatedTimelineAdminEmail, res["admin_email"])
	}

	// 2. POST /api/timeline/jump without auth -> Unauthorized
	jumpPayload, _ := json.Marshal(map[string]interface{}{"year": 1920})
	req = httptest.NewRequest(http.MethodPost, "/api/timeline/jump", bytes.NewReader(jumpPayload))
	rr = httptest.NewRecorder()
	JumpTimelineHandler(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("Expected status 401 for unauthenticated jump, got %d", rr.Code)
	}

	// 3. POST /api/timeline/jump with non-admin user -> Forbidden
	nonAdminToken := &auth.Token{UserID: 2, Username: "regularUser", Email: "regular@example.com"}
	ctx := req.Context()
	ctx = context.WithValue(ctx, "user", nonAdminToken)
	req = req.WithContext(ctx)
	rr = httptest.NewRecorder()
	JumpTimelineHandler(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("Expected status 403 for non-admin jump, got %d", rr.Code)
	}

	// 4. POST /api/timeline/jump with admin nalex@sfsw.net -> Success
	adminToken := &auth.Token{UserID: 1, Username: "nalex", Email: NominatedTimelineAdminEmail}
	jumpPayload, _ = json.Marshal(map[string]interface{}{"year": 1920})
	req = httptest.NewRequest(http.MethodPost, "/api/timeline/jump", bytes.NewReader(jumpPayload))
	req = req.WithContext(context.WithValue(req.Context(), "user", adminToken))
	rr = httptest.NewRecorder()
	JumpTimelineHandler(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("JumpTimelineHandler admin status = %d, expected 200", rr.Code)
	}
	res = nil
	json.Unmarshal(rr.Body.Bytes(), &res)
	if res["era_id"] != "decolonisation" {
		t.Errorf("Expected era_id decolonisation, got %v", res["era_id"])
	}

	// 5. POST /api/timeline/scale with admin
	scalePayload, _ := json.Marshal(map[string]interface{}{"scale": "5s"})
	req = httptest.NewRequest(http.MethodPost, "/api/timeline/scale", bytes.NewReader(scalePayload))
	req = req.WithContext(context.WithValue(req.Context(), "user", adminToken))
	rr = httptest.NewRecorder()
	SetTimelineScaleHandler(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("SetTimelineScaleHandler status = %d, expected 200", rr.Code)
	}
	res = nil
	json.Unmarshal(rr.Body.Bytes(), &res)
	if res["chrono_scale"] != "5s" {
		t.Errorf("Expected chrono_scale 5s, got %v", res["chrono_scale"])
	}

	// 6. POST /api/timeline/pause with admin
	pausePayload, _ := json.Marshal(map[string]interface{}{"paused": true})
	req = httptest.NewRequest(http.MethodPost, "/api/timeline/pause", bytes.NewReader(pausePayload))
	req = req.WithContext(context.WithValue(req.Context(), "user", adminToken))
	rr = httptest.NewRecorder()
	SetTimelinePauseHandler(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("SetTimelinePauseHandler status = %d, expected 200", rr.Code)
	}
	res = nil
	json.Unmarshal(rr.Body.Bytes(), &res)
	if res["is_paused"] != true {
		t.Errorf("Expected is_paused true, got %v", res["is_paused"])
	}

	// 7. GET /api/admin/dashboard without auth -> 401
	req = httptest.NewRequest(http.MethodGet, "/api/admin/dashboard", nil)
	rr = httptest.NewRecorder()
	GetAdminDashboardHandler(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("GetAdminDashboardHandler no auth status = %d, expected 401", rr.Code)
	}

	// 8. GET /api/admin/dashboard with regular player -> 403
	req = httptest.NewRequest(http.MethodGet, "/api/admin/dashboard", nil)
	req = req.WithContext(context.WithValue(req.Context(), "user", nonAdminToken))
	rr = httptest.NewRecorder()
	GetAdminDashboardHandler(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("GetAdminDashboardHandler player status = %d, expected 403", rr.Code)
	}

	// 9. GET /api/admin/dashboard with admin role -> 200
	roleAdminToken := &auth.Token{UserID: 2, Username: "customadmin", Email: "admin@test.com", Role: "admin"}
	req = httptest.NewRequest(http.MethodGet, "/api/admin/dashboard", nil)
	req = req.WithContext(context.WithValue(req.Context(), "user", roleAdminToken))
	rr = httptest.NewRecorder()
	GetAdminDashboardHandler(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GetAdminDashboardHandler role admin status = %d, expected 200", rr.Code)
	}
	var dashRes map[string]interface{}
	json.Unmarshal(rr.Body.Bytes(), &dashRes)
	if dashRes["admin_role"] != "admin" {
		t.Errorf("Expected admin_role admin, got %v", dashRes["admin_role"])
	}
	if dashRes["timeline"] == nil {
		t.Errorf("Expected timeline map in dashboard response")
	}

	// 10. GET /api/admin/dashboard with nalex -> 200
	nalexToken := &auth.Token{UserID: 1, Username: "nalex", Email: "nalex@sfsw.net"}
	req = httptest.NewRequest(http.MethodGet, "/api/admin/dashboard", nil)
	req = req.WithContext(context.WithValue(req.Context(), "user", nalexToken))
	rr = httptest.NewRecorder()
	GetAdminDashboardHandler(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GetAdminDashboardHandler nalex status = %d, expected 200", rr.Code)
	}

	// 11. GET /api/admin/dashboard with dedicated admin@sfsw.net -> 200
	newAdminToken := &auth.Token{UserID: 3, Username: "admin", Email: "admin@sfsw.net"}
	req = httptest.NewRequest(http.MethodGet, "/api/admin/dashboard", nil)
	req = req.WithContext(context.WithValue(req.Context(), "user", newAdminToken))
	rr = httptest.NewRecorder()
	GetAdminDashboardHandler(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GetAdminDashboardHandler admin@sfsw.net status = %d, expected 200", rr.Code)
	}

	// 12. POST /api/timeline/jump with admin@sfsw.net -> 200
	jumpPayload, _ = json.Marshal(map[string]interface{}{"year": 1750})
	req = httptest.NewRequest(http.MethodPost, "/api/timeline/jump", bytes.NewReader(jumpPayload))
	req = req.WithContext(context.WithValue(req.Context(), "user", newAdminToken))
	rr = httptest.NewRecorder()
	JumpTimelineHandler(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("JumpTimelineHandler admin@sfsw.net status = %d, expected 200", rr.Code)
	}

	// 13. POST /api/admin/reset-game without auth -> 401
	resetPayload, _ := json.Marshal(map[string]interface{}{"confirmation": "RESET WORLD 1500"})
	req = httptest.NewRequest(http.MethodPost, "/api/admin/reset-game", bytes.NewReader(resetPayload))
	rr = httptest.NewRecorder()
	AdminResetGameHandler(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("AdminResetGameHandler unauthenticated status = %d, expected 401", rr.Code)
	}

	// 14. POST /api/admin/reset-game with player -> 403
	req = httptest.NewRequest(http.MethodPost, "/api/admin/reset-game", bytes.NewReader(resetPayload))
	req = req.WithContext(context.WithValue(req.Context(), "user", nonAdminToken))
	rr = httptest.NewRecorder()
	AdminResetGameHandler(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("AdminResetGameHandler player status = %d, expected 403", rr.Code)
	}

	// 15. POST /api/admin/reset-game with invalid confirmation phrase -> 400
	badKeyPayload, _ := json.Marshal(map[string]interface{}{"confirmation": "wrong key"})
	req = httptest.NewRequest(http.MethodPost, "/api/admin/reset-game", bytes.NewReader(badKeyPayload))
	req = req.WithContext(context.WithValue(req.Context(), "user", newAdminToken))
	rr = httptest.NewRecorder()
	AdminResetGameHandler(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("AdminResetGameHandler bad key status = %d, expected 400", rr.Code)
	}

	// 16. POST /api/admin/reset-game with admin and exact confirmation phrase -> 200
	validResetPayload, _ := json.Marshal(map[string]interface{}{
		"confirmation": "RESET WORLD 1500",
		"clear_claims": true,
	})
	req = httptest.NewRequest(http.MethodPost, "/api/admin/reset-game", bytes.NewReader(validResetPayload))
	req = req.WithContext(context.WithValue(req.Context(), "user", newAdminToken))
	rr = httptest.NewRecorder()
	AdminResetGameHandler(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("AdminResetGameHandler valid admin status = %d, expected 200", rr.Code)
	}
	var resetRes map[string]interface{}
	json.Unmarshal(rr.Body.Bytes(), &resetRes)
	if resetRes["success"] != true {
		t.Errorf("Expected success true, got %v", resetRes["success"])
	}
	if resetRes["sim_year"] != 1500.0 {
		t.Errorf("Expected sim_year 1500.0, got %v", resetRes["sim_year"])
	}
	if resetRes["era_id"] != "discovery" {
		t.Errorf("Expected era_id discovery, got %v", resetRes["era_id"])
	}
}

