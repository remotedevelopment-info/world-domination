package handlers

import (
	"testing"
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

