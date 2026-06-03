package proxy

import (
	"encoding/base64"
	"testing"
)

func TestExtractSessionID(t *testing.T) {
	tests := []struct {
		name     string
		header   string
		expected string
	}{
		{
			name:     "valid session",
			header:   "Basic " + base64.StdEncoding.EncodeToString([]byte("my-session-id:token-my-session-id")),
			expected: "my-session-id",
		},
		{
			name:     "uuid session",
			header:   "Basic " + base64.StdEncoding.EncodeToString([]byte("550e8400-e29b-41d4-a716-446655440000:session-token")),
			expected: "550e8400-e29b-41d4-a716-446655440000",
		},
		{
			name:     "empty header",
			header:   "",
			expected: "",
		},
		{
			name:     "no Basic prefix",
			header:   "Bearer token123",
			expected: "",
		},
		{
			name:     "invalid base64",
			header:   "Basic not-valid-base64!!!",
			expected: "",
		},
		{
			name:     "no colon in decoded",
			header:   "Basic " + base64.StdEncoding.EncodeToString([]byte("sessiononly")),
			expected: "sessiononly",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ExtractSessionID(tt.header)
			if got != tt.expected {
				t.Errorf("ExtractSessionID(%q) = %q, want %q", tt.header, got, tt.expected)
			}
		})
	}
}

func TestExtractSessionCredentials(t *testing.T) {
	header := "Basic " + base64.StdEncoding.EncodeToString([]byte("my-session-id:session-secret"))

	got := ExtractSessionCredentials(header)
	if got.SessionID != "my-session-id" {
		t.Fatalf("session ID: got %q, want my-session-id", got.SessionID)
	}
	if got.Token != "session-secret" {
		t.Fatalf("token: got %q, want session-secret", got.Token)
	}
}
