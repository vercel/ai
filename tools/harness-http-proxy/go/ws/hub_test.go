package ws

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/vercel/sandbox/http-proxy-server/protocol"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))
}

func TestHubResolve(t *testing.T) {
	hub := NewHub("test-token", testLogger())

	requestID := "req-123"

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		time.Sleep(50 * time.Millisecond)
		response := protocol.ProxyResponse{
			Type:      protocol.TypeResponse,
			RequestID: requestID,
			Status:    200,
		}
		data, _ := json.Marshal(response)
		hub.Resolve(requestID, data)
	}()

	ch := make(chan pendingResponse, 1)
	hub.pending.Store(requestID, &pendingRequest{sessionID: "session-a", ch: ch})
	defer hub.pending.Delete(requestID)

	wg.Wait()

	select {
	case pending := <-ch:
		if pending.err != nil {
			t.Fatalf("unexpected pending error: %v", pending.err)
		}
		var resp protocol.ProxyResponse
		if err := json.Unmarshal(pending.data, &resp); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if resp.Status != 200 {
			t.Errorf("status: got %d, want 200", resp.Status)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for response")
	}
}

func TestHubResolveUnknownRequestDoesNotPanic(t *testing.T) {
	hub := NewHub("test-token", testLogger())
	hub.Resolve("nonexistent-request-id", []byte(`{}`))
}

func TestHubReadyChannel(t *testing.T) {
	hub := NewHub("test-token", testLogger())

	select {
	case <-hub.Ready():
		t.Fatal("ready channel should not be closed yet")
	default:
	}

	hub.readyOnce.Do(func() { close(hub.ready) })

	select {
	case <-hub.Ready():
	case <-time.After(100 * time.Millisecond):
		t.Fatal("ready channel should be closed")
	}
}

func TestHubRejectsInvalidToken(t *testing.T) {
	hub := NewHub("correct-token", testLogger())

	server := httptest.NewServer(http.HandlerFunc(hub.HandleWebSocket))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?token=wrong-token"
	_, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err == nil {
		t.Fatal("expected connection to be rejected")
	}
	if resp != nil && resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestHubAcceptsValidToken(t *testing.T) {
	hub := NewHub("correct-token", testLogger())

	server := httptest.NewServer(http.HandlerFunc(hub.HandleWebSocket))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?token=correct-token"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("expected connection to succeed: %v", err)
	}
	defer conn.Close()
}

func TestHubWebSocketReadyMessage(t *testing.T) {
	hub := NewHub("token", testLogger())

	server := httptest.NewServer(http.HandlerFunc(hub.HandleWebSocket))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?token=token"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	ready := protocol.ReadyMessage{Type: protocol.TypeReady}
	data, _ := json.Marshal(ready)
	conn.WriteMessage(websocket.TextMessage, data)

	_, ackData, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("read ready ack: %v", err)
	}
	var ack protocol.ReadyAckMessage
	if err := json.Unmarshal(ackData, &ack); err != nil {
		t.Fatalf("unmarshal ready ack: %v", err)
	}
	if ack.Type != protocol.TypeReadyAck {
		t.Fatalf("ack type: got %q, want %q", ack.Type, protocol.TypeReadyAck)
	}
	if ack.Version != protocol.ProtocolVersion {
		t.Fatalf("ack version: got %q, want %q", ack.Version, protocol.ProtocolVersion)
	}

	select {
	case <-hub.Ready():
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for ready")
	}
}

func TestHubWebSocketResponseRouting(t *testing.T) {
	hub := NewHub("token", testLogger())

	server := httptest.NewServer(http.HandlerFunc(hub.HandleWebSocket))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?token=token"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	requestID := "test-req-1"
	ch := make(chan pendingResponse, 1)
	hub.pending.Store(requestID, &pendingRequest{sessionID: "session-a", ch: ch})
	defer hub.pending.Delete(requestID)

	resp := protocol.ProxyResponse{
		Type:      protocol.TypeResponse,
		RequestID: requestID,
		Status:    404,
	}
	data, _ := json.Marshal(resp)
	conn.WriteMessage(websocket.TextMessage, data)

	select {
	case received := <-ch:
		if received.err != nil {
			t.Fatalf("unexpected pending error: %v", received.err)
		}
		var parsed protocol.ProxyResponse
		if err := json.Unmarshal(received.data, &parsed); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if parsed.Status != 404 {
			t.Errorf("status: got %d, want 404", parsed.Status)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for response on channel")
	}
}

func TestHubWebSocketRequestErrorRouting(t *testing.T) {
	hub := NewHub("token", testLogger())

	server := httptest.NewServer(http.HandlerFunc(hub.HandleWebSocket))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?token=token"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	requestID := "test-req-request-error"
	ch := make(chan pendingResponse, 1)
	hub.pending.Store(requestID, &pendingRequest{sessionID: "session-a", ch: ch})
	defer hub.pending.Delete(requestID)

	errMsg := protocol.RequestErrorMessage{
		Type:      protocol.TypeRequestError,
		RequestID: requestID,
		Message:   "No handler for session session-a",
	}
	data, _ := json.Marshal(errMsg)
	conn.WriteMessage(websocket.TextMessage, data)

	select {
	case received := <-ch:
		if received.err != nil {
			t.Fatalf("unexpected pending error: %v", received.err)
		}
		var parsed protocol.RequestErrorMessage
		if err := json.Unmarshal(received.data, &parsed); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if parsed.Message != errMsg.Message {
			t.Fatalf("message: got %q, want %q", parsed.Message, errMsg.Message)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for request-error on channel")
	}
}

// --- Multi-client tests ---

func TestHubMultiClientSessionRouting(t *testing.T) {
	hub := NewHub("token", testLogger())

	server := httptest.NewServer(http.HandlerFunc(hub.HandleWebSocket))
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?token=token"

	// Connect client A
	connA, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial A: %v", err)
	}
	defer connA.Close()

	// Connect client B
	connB, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial B: %v", err)
	}
	defer connB.Close()

	// Client A registers session-a
	regA, _ := json.Marshal(protocol.RegisterMessage{Type: protocol.TypeRegister, Sessions: []protocol.SessionRegistration{{SessionID: "session-a", Token: "token-a"}}})
	connA.WriteMessage(websocket.TextMessage, regA)

	// Client B registers session-b
	regB, _ := json.Marshal(protocol.RegisterMessage{Type: protocol.TypeRegister, Sessions: []protocol.SessionRegistration{{SessionID: "session-b", Token: "token-b"}}})
	connB.WriteMessage(websocket.TextMessage, regB)

	time.Sleep(50 * time.Millisecond) // Let registrations propagate

	// readProxyRequest reads from WS, skipping control messages like register-ack
	readProxyRequest := func(conn *websocket.Conn) string {
		conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		for {
			_, data, err := conn.ReadMessage()
			if err != nil {
				return "error: " + err.Error()
			}
			msgType, _ := protocol.ParseType(data)
			if msgType == protocol.TypeRequest {
				return string(data)
			}
			// Skip control messages (register-ack, etc.)
		}
	}

	// Read from both clients in goroutines
	receivedA := make(chan string, 1)
	go func() { receivedA <- readProxyRequest(connA) }()

	receivedB := make(chan string, 1)
	go func() { receivedB <- readProxyRequest(connB) }()

	// Send to session-a → should go to client A
	msg := protocol.ProxyRequest{
		Type:      protocol.TypeRequest,
		RequestID: "req-1",
		SessionID: "session-a",
		Method:    "GET",
		URL:       "http://example.com/a",
	}
	if err := hub.SendToSession("session-a", "token-a", msg); err != nil {
		t.Fatalf("send to session-a: %v", err)
	}

	// Send to session-b → should go to client B
	msg2 := protocol.ProxyRequest{
		Type:      protocol.TypeRequest,
		RequestID: "req-2",
		SessionID: "session-b",
		Method:    "GET",
		URL:       "http://example.com/b",
	}
	if err := hub.SendToSession("session-b", "token-b", msg2); err != nil {
		t.Fatalf("send to session-b: %v", err)
	}

	// Verify routing
	dataA := <-receivedA
	if !strings.Contains(dataA, "session-a") || !strings.Contains(dataA, "example.com/a") {
		t.Errorf("client A got wrong message: %s", dataA)
	}

	dataB := <-receivedB
	if !strings.Contains(dataB, "session-b") || !strings.Contains(dataB, "example.com/b") {
		t.Errorf("client B got wrong message: %s", dataB)
	}
}

func TestHubRejectsSessionStealAndInvalidToken(t *testing.T) {
	hub := NewHub("token", testLogger())

	server := httptest.NewServer(http.HandlerFunc(hub.HandleWebSocket))
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?token=token"

	connA, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial A: %v", err)
	}
	defer connA.Close()

	connB, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial B: %v", err)
	}
	defer connB.Close()

	regA, _ := json.Marshal(protocol.RegisterMessage{Type: protocol.TypeRegister, Sessions: []protocol.SessionRegistration{{SessionID: "shared-session", Token: "token-a"}}})
	if err := connA.WriteMessage(websocket.TextMessage, regA); err != nil {
		t.Fatalf("write register A: %v", err)
	}
	connA.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, ackData, err := connA.ReadMessage()
	if err != nil {
		t.Fatalf("read register A ack: %v", err)
	}
	var ack protocol.RegisterAckMessage
	if err := json.Unmarshal(ackData, &ack); err != nil {
		t.Fatalf("unmarshal register A ack: %v", err)
	}
	if ack.Type != protocol.TypeRegisterAck || len(ack.Sessions) != 1 || ack.Sessions[0].SessionID != "shared-session" {
		t.Fatalf("register A ack: got %+v", ack)
	}

	regB, _ := json.Marshal(protocol.RegisterMessage{Type: protocol.TypeRegister, Sessions: []protocol.SessionRegistration{{SessionID: "shared-session", Token: "token-b"}}})
	if err := connB.WriteMessage(websocket.TextMessage, regB); err != nil {
		t.Fatalf("write register B: %v", err)
	}
	connB.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, errData, err := connB.ReadMessage()
	if err != nil {
		t.Fatalf("read register B error: %v", err)
	}
	var registerErr protocol.RequestErrorMessage
	if err := json.Unmarshal(errData, &registerErr); err != nil {
		t.Fatalf("unmarshal register B error: %v", err)
	}
	if registerErr.Type != protocol.TypeRequestError || !strings.Contains(registerErr.Message, "already registered") {
		t.Fatalf("register B error: got %+v", registerErr)
	}

	msg := protocol.ProxyRequest{
		Type:      protocol.TypeRequest,
		RequestID: "req-invalid-token",
		SessionID: "shared-session",
		Method:    "GET",
		URL:       "http://example.com/shared",
	}
	if err := hub.SendToSession("shared-session", "token-b", msg); err == nil || !strings.Contains(err.Error(), "invalid token") {
		t.Fatalf("SendToSession with stolen token error: got %v, want invalid token", err)
	}
	if err := hub.SendToSession("shared-session", "token-a", msg); err != nil {
		t.Fatalf("SendToSession with owner token: %v", err)
	}
}

func TestHubClientDisconnectCleansUpSessions(t *testing.T) {
	hub := NewHub("token", testLogger())

	server := httptest.NewServer(http.HandlerFunc(hub.HandleWebSocket))
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?token=token"

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}

	// Register sessions
	reg, _ := json.Marshal(protocol.RegisterMessage{Type: protocol.TypeRegister, Sessions: []protocol.SessionRegistration{{SessionID: "s1", Token: "token-s1"}, {SessionID: "s2", Token: "token-s2"}}})
	conn.WriteMessage(websocket.TextMessage, reg)
	time.Sleep(50 * time.Millisecond)

	// Verify sessions are registered
	hub.sessionsMu.RLock()
	if len(hub.sessions) != 2 {
		t.Errorf("expected 2 sessions, got %d", len(hub.sessions))
	}
	hub.sessionsMu.RUnlock()

	// Disconnect
	conn.Close()
	time.Sleep(100 * time.Millisecond)

	// Verify sessions are cleaned up
	hub.sessionsMu.RLock()
	if len(hub.sessions) != 0 {
		t.Errorf("expected 0 sessions after disconnect, got %d", len(hub.sessions))
	}
	hub.sessionsMu.RUnlock()
}

func TestHubUnregisteredSessionReturnsError(t *testing.T) {
	hub := NewHub("token", testLogger())

	err := hub.SendToSession("nonexistent-session", "token", protocol.ProxyRequest{})
	if err == nil {
		t.Fatal("expected error for unregistered session")
	}
}

func TestHubSendToSessionAndWaitTimesOutWithoutResponse(t *testing.T) {
	hub := NewHub("token", testLogger())

	server := httptest.NewServer(http.HandlerFunc(hub.HandleWebSocket))
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?token=token"

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	reg, _ := json.Marshal(protocol.RegisterMessage{Type: protocol.TypeRegister, Sessions: []protocol.SessionRegistration{{SessionID: "slow-session", Token: "token-slow"}}})
	conn.WriteMessage(websocket.TextMessage, reg)
	time.Sleep(50 * time.Millisecond)

	done := make(chan error, 1)
	go func() {
		_, err := hub.SendToSessionAndWait("slow-session", "token-slow", "req-timeout", protocol.ProxyRequest{
			Type:      protocol.TypeRequest,
			RequestID: "req-timeout",
			SessionID: "slow-session",
			Method:    "GET",
			URL:       "http://example.com/slow",
		}, 20*time.Millisecond)
		done <- err
	}()

	conn.SetReadDeadline(time.Now().Add(1 * time.Second))
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("read ws request: %v", err)
		}
		msgType, _ := protocol.ParseType(data)
		if msgType == protocol.TypeRequest {
			break
		}
	}

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("expected timeout error")
		}
		if !strings.Contains(err.Error(), "timed out waiting for response") {
			t.Fatalf("unexpected timeout error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for SendToSessionAndWait error")
	}
}

func TestHubClientDisconnectFailsPendingRequest(t *testing.T) {
	hub := NewHub("token", testLogger())

	server := httptest.NewServer(http.HandlerFunc(hub.HandleWebSocket))
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?token=token"

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}

	reg, _ := json.Marshal(protocol.RegisterMessage{Type: protocol.TypeRegister, Sessions: []protocol.SessionRegistration{{SessionID: "disconnect-session", Token: "token-disconnect"}}})
	conn.WriteMessage(websocket.TextMessage, reg)
	time.Sleep(50 * time.Millisecond)

	done := make(chan error, 1)
	go func() {
		_, err := hub.SendToSessionAndWait("disconnect-session", "token-disconnect", "req-disconnect", protocol.ProxyRequest{
			Type:      protocol.TypeRequest,
			RequestID: "req-disconnect",
			SessionID: "disconnect-session",
			Method:    "GET",
			URL:       "http://example.com/disconnect",
		}, time.Second)
		done <- err
	}()

	conn.SetReadDeadline(time.Now().Add(1 * time.Second))
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("read ws request: %v", err)
		}
		msgType, _ := protocol.ParseType(data)
		if msgType == protocol.TypeRequest {
			break
		}
	}

	if err := conn.Close(); err != nil {
		t.Fatalf("close ws: %v", err)
	}

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("expected disconnect error")
		}
		if !strings.Contains(err.Error(), "disconnected before response") {
			t.Fatalf("unexpected disconnect error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for disconnect error")
	}
}
