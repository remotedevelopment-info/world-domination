package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"kingdom-conquest/backend/internal/game"
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

	// 1. GET /api/timeline
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

	// 2. POST /api/timeline/jump
	jumpPayload, _ := json.Marshal(map[string]interface{}{"year": 1920})
	req = httptest.NewRequest(http.MethodPost, "/api/timeline/jump", bytes.NewReader(jumpPayload))
	rr = httptest.NewRecorder()
	JumpTimelineHandler(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("JumpTimelineHandler status = %d, expected 200", rr.Code)
	}
	res = nil
	json.Unmarshal(rr.Body.Bytes(), &res)
	if res["era_id"] != "decolonisation" {
		t.Errorf("Expected era_id decolonisation, got %v", res["era_id"])
	}

	// 3. POST /api/timeline/scale
	scalePayload, _ := json.Marshal(map[string]interface{}{"scale": "5s"})
	req = httptest.NewRequest(http.MethodPost, "/api/timeline/scale", bytes.NewReader(scalePayload))
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

	// 4. POST /api/timeline/pause
	pausePayload, _ := json.Marshal(map[string]interface{}{"paused": true})
	req = httptest.NewRequest(http.MethodPost, "/api/timeline/pause", bytes.NewReader(pausePayload))
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
}

