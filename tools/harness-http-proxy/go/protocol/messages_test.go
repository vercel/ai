package protocol

import (
	"encoding/json"
	"testing"
)

func TestParseType(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
		wantErr  bool
	}{
		{"request", `{"type":"request","requestId":"abc"}`, TypeRequest, false},
		{"response", `{"type":"response","requestId":"abc"}`, TypeResponse, false},
		{"connect", `{"type":"connect","requestId":"abc"}`, TypeConnect, false},
		{"connect-response", `{"type":"connect-response","requestId":"abc"}`, TypeConnectResponse, false},
		{"ready", `{"type":"ready"}`, TypeReady, false},
		{"error", `{"type":"error","requestId":"abc"}`, TypeError, false},
		{"empty type", `{"type":""}`, "", false},
		{"invalid json", `not json`, "", true},
		{"empty input", ``, "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseType([]byte(tt.input))
			if tt.wantErr {
				if err == nil {
					t.Error("expected error but got none")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.expected {
				t.Errorf("got %q, want %q", got, tt.expected)
			}
		})
	}
}

func TestProxyRequestRoundtrip(t *testing.T) {
	req := ProxyRequest{
		Type:      TypeRequest,
		RequestID: "req-123",
		SessionID: "sess-456",
		Method:    "POST",
		URL:       "http://example.com/api",
		Headers:   map[string][]string{"Content-Type": {"application/json"}},
		Body:      "aGVsbG8=", // base64("hello")
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var decoded ProxyRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if decoded.Type != req.Type {
		t.Errorf("type: got %q, want %q", decoded.Type, req.Type)
	}
	if decoded.RequestID != req.RequestID {
		t.Errorf("requestId: got %q, want %q", decoded.RequestID, req.RequestID)
	}
	if decoded.SessionID != req.SessionID {
		t.Errorf("sessionId: got %q, want %q", decoded.SessionID, req.SessionID)
	}
	if decoded.Method != req.Method {
		t.Errorf("method: got %q, want %q", decoded.Method, req.Method)
	}
	if decoded.URL != req.URL {
		t.Errorf("url: got %q, want %q", decoded.URL, req.URL)
	}
	if decoded.Body != req.Body {
		t.Errorf("body: got %q, want %q", decoded.Body, req.Body)
	}
}

func TestProxyResponseRoundtrip(t *testing.T) {
	resp := ProxyResponse{
		Type:      TypeResponse,
		RequestID: "req-123",
		Status:    201,
		Headers:   map[string][]string{"X-Custom": {"value1", "value2"}},
		Body:      "d29ybGQ=", // base64("world")
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var decoded ProxyResponse
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if decoded.Status != resp.Status {
		t.Errorf("status: got %d, want %d", decoded.Status, resp.Status)
	}
	if decoded.RequestID != resp.RequestID {
		t.Errorf("requestId: got %q, want %q", decoded.RequestID, resp.RequestID)
	}
	if len(decoded.Headers["X-Custom"]) != 2 {
		t.Errorf("headers: got %v, want 2 values", decoded.Headers["X-Custom"])
	}
}

func TestConnectRequestRoundtrip(t *testing.T) {
	req := ConnectRequest{
		Type:      TypeConnect,
		RequestID: "req-789",
		SessionID: "sess-abc",
		Host:      "example.com:443",
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var decoded ConnectRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if decoded.Host != req.Host {
		t.Errorf("host: got %q, want %q", decoded.Host, req.Host)
	}
}

func TestConnectResponseRoundtrip(t *testing.T) {
	resp := ConnectResponse{
		Type:      TypeConnectResponse,
		RequestID: "req-789",
		Allow:     true,
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var decoded ConnectResponse
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if decoded.Allow != true {
		t.Error("allow: got false, want true")
	}
}

func TestErrorMessageRoundtrip(t *testing.T) {
	msg := ErrorMessage{
		Type:      TypeError,
		RequestID: "req-err",
		Message:   "something went wrong",
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var decoded ErrorMessage
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if decoded.Message != msg.Message {
		t.Errorf("message: got %q, want %q", decoded.Message, msg.Message)
	}
}

func TestEmptyBodyOmitted(t *testing.T) {
	req := ProxyRequest{
		Type:      TypeRequest,
		RequestID: "req-1",
		SessionID: "sess-1",
		Method:    "GET",
		URL:       "http://example.com",
		Headers:   map[string][]string{},
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	// body should be omitted when empty
	var raw map[string]interface{}
	json.Unmarshal(data, &raw)
	if _, exists := raw["body"]; exists {
		t.Error("expected body to be omitted from JSON when empty")
	}
}
