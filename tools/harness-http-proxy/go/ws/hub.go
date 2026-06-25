package ws

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/vercel/sandbox/http-proxy-server/protocol"
)

var upgrader = websocket.Upgrader{}

// ClientState tracks a connected WS client and its registered sessions.
type ClientState struct {
	conn       *websocket.Conn
	writeMu    sync.Mutex
	sessionIDs map[string]bool
	tokens     map[string]string
}

type pendingResponse struct {
	data []byte
	err  error
}

type pendingRequest struct {
	sessionID string
	ch        chan pendingResponse
}

func (cs *ClientState) WriteJSON(msg any) error {
	cs.writeMu.Lock()
	defer cs.writeMu.Unlock()
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return cs.conn.WriteMessage(websocket.TextMessage, data)
}

// Hub manages multiple WebSocket clients from external TS processes.
// Each client registers the session IDs it owns. The HTTP proxy routes
// requests to the correct client based on session ID.
type Hub struct {
	token  []byte
	logger *slog.Logger

	// Multiple connected WS clients
	clients   map[*websocket.Conn]*ClientState
	clientsMu sync.RWMutex

	// Session → client routing
	sessions   map[string]*ClientState
	sessionsMu sync.RWMutex

	// Pending HTTP requests waiting for a response, keyed by requestId
	pending sync.Map // map[string]*pendingRequest

	// Signals that at least one TS client has sent "ready"
	ready     chan struct{}
	readyOnce sync.Once

	// Signals when a new session is registered (for buffering)
	sessionAdded   chan struct{}
	sessionAddedMu sync.Mutex
}

func NewHub(token string, logger *slog.Logger) *Hub {
	return &Hub{
		token:        []byte(token),
		logger:       logger,
		ready:        make(chan struct{}),
		sessionAdded: make(chan struct{}),
		clients:      make(map[*websocket.Conn]*ClientState),
		sessions:     make(map[string]*ClientState),
	}
}

// waitForSession blocks until the given session ID is registered or timeout.
func (h *Hub) waitForSession(sessionID string, timeout time.Duration) error {
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	for {
		h.sessionsMu.RLock()
		_, ok := h.sessions[sessionID]
		h.sessionsMu.RUnlock()
		if ok {
			return nil
		}

		// Wait for a session registration signal or timeout
		h.sessionAddedMu.Lock()
		ch := h.sessionAdded
		h.sessionAddedMu.Unlock()

		select {
		case <-ch:
			// A session was registered — check again
			continue
		case <-timer.C:
			return fmt.Errorf("timeout after %v", timeout)
		}
	}
}

// Ready returns a channel that is closed when the first TS client sends "ready".
func (h *Hub) Ready() <-chan struct{} {
	return h.ready
}

// SendToSession sends a JSON message to the WS client that owns the given session.
func (h *Hub) SendToSession(sessionID string, sessionToken string, msg any) error {
	h.sessionsMu.RLock()
	cs, ok := h.sessions[sessionID]
	expectedToken := ""
	if cs != nil {
		expectedToken = cs.tokens[sessionID]
	}
	h.sessionsMu.RUnlock()

	if !ok || cs == nil {
		return fmt.Errorf("no client registered for session %s", sessionID)
	}
	if subtle.ConstantTimeCompare([]byte(sessionToken), []byte(expectedToken)) != 1 {
		return fmt.Errorf("invalid token for session %s", sessionID)
	}

	return cs.WriteJSON(msg)
}

// SendToSessionAndWait sends a request to the session owner and blocks until a response arrives.
// If no session is registered yet, it waits up to timeout for one to appear (buffering).
func (h *Hub) SendToSessionAndWait(sessionID string, sessionToken string, requestID string, msg any, timeout time.Duration) ([]byte, error) {
	req := &pendingRequest{
		sessionID: sessionID,
		ch:        make(chan pendingResponse, 1),
	}
	h.pending.Store(requestID, req)
	defer h.pending.Delete(requestID)

	// Try to send immediately
	err := h.SendToSession(sessionID, sessionToken, msg)
	if err != nil {
		// No session registered yet — wait for one to appear
		h.logger.Debug("No session yet, buffering request", "sessionId", sessionID, "requestId", requestID)
		if waitErr := h.waitForSession(sessionID, timeout); waitErr != nil {
			return nil, fmt.Errorf("timed out waiting for session %s: %v (original: %v)", sessionID, waitErr, err)
		}
		// Retry send after session appeared
		if err = h.SendToSession(sessionID, sessionToken, msg); err != nil {
			return nil, err
		}
	}

	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case resp := <-req.ch:
		if resp.err != nil {
			return nil, resp.err
		}
		return resp.data, nil
	case <-timer.C:
		return nil, fmt.Errorf("timed out waiting for response to request %s after %v", requestID, timeout)
	}
}

// Resolve delivers a response to a pending request.
func (h *Hub) Resolve(requestID string, data []byte) {
	h.resolvePending(requestID, pendingResponse{data: data})
}

// ResolveError delivers an error to a pending request.
func (h *Hub) ResolveError(requestID string, err error) {
	h.resolvePending(requestID, pendingResponse{err: err})
}

func (h *Hub) resolvePending(requestID string, resp pendingResponse) {
	val, ok := h.pending.Load(requestID)
	if !ok {
		h.logger.Warn("No pending request for response", "requestId", requestID)
		return
	}
	req := val.(*pendingRequest)
	select {
	case req.ch <- resp:
	default:
		h.logger.Warn("Pending request channel already full", "requestId", requestID)
	}
}

func (h *Hub) registerSessions(cs *ClientState, sessions []protocol.SessionRegistration) ([]protocol.SessionRegistrationAck, error) {
	h.sessionsMu.Lock()
	defer h.sessionsMu.Unlock()

	acks := make([]protocol.SessionRegistrationAck, 0, len(sessions))
	for _, session := range sessions {
		id := session.SessionID
		if id == "" || session.Token == "" {
			return nil, fmt.Errorf("session registration requires non-empty sessionId and token")
		}
		if existing := h.sessions[id]; existing != nil && existing != cs {
			return nil, fmt.Errorf("session %s is already registered", id)
		}
		if existingToken := cs.tokens[id]; existingToken != "" && existingToken != session.Token {
			return nil, fmt.Errorf("session %s token cannot be changed while registered", id)
		}
		h.sessions[id] = cs
		cs.sessionIDs[id] = true
		cs.tokens[id] = session.Token
		acks = append(acks, protocol.SessionRegistrationAck{SessionID: id})
	}
	h.logger.Debug("Sessions registered", "count", len(sessions))

	// Signal any goroutines waiting for a session
	h.sessionAddedMu.Lock()
	close(h.sessionAdded)
	h.sessionAdded = make(chan struct{})
	h.sessionAddedMu.Unlock()
	return acks, nil
}

func (h *Hub) unregisterSessions(cs *ClientState, sessionIDs []string) {
	h.sessionsMu.Lock()
	defer h.sessionsMu.Unlock()
	for _, id := range sessionIDs {
		if h.sessions[id] == cs {
			delete(h.sessions, id)
		}
		delete(cs.sessionIDs, id)
		delete(cs.tokens, id)
	}
	h.failPendingRequestsForSessions(sessionIDs, "session unregistered before response")
}

func (h *Hub) removeClient(conn *websocket.Conn) {
	h.clientsMu.Lock()
	cs, ok := h.clients[conn]
	if ok {
		delete(h.clients, conn)
	}
	h.clientsMu.Unlock()

	if ok && cs != nil {
		sessionIDs := make([]string, 0, len(cs.sessionIDs))
		// Clean up all session mappings for this client
		h.sessionsMu.Lock()
		for id := range cs.sessionIDs {
			sessionIDs = append(sessionIDs, id)
			if h.sessions[id] == cs {
				delete(h.sessions, id)
			}
			delete(cs.tokens, id)
		}
		h.sessionsMu.Unlock()
		h.failPendingRequestsForSessions(sessionIDs, "session client disconnected before response")
	}
}

func (h *Hub) failPendingRequestsForSessions(sessionIDs []string, reason string) {
	if len(sessionIDs) == 0 {
		return
	}

	sessionSet := make(map[string]struct{}, len(sessionIDs))
	for _, sessionID := range sessionIDs {
		sessionSet[sessionID] = struct{}{}
	}

	h.pending.Range(func(key, value any) bool {
		requestID, ok := key.(string)
		if !ok {
			return true
		}
		req, ok := value.(*pendingRequest)
		if !ok {
			return true
		}
		if _, matches := sessionSet[req.sessionID]; matches {
			h.ResolveError(requestID, fmt.Errorf("%s: %s", reason, req.sessionID))
		}
		return true
	})
}

// HandleWebSocket is the HTTP handler for the /ws endpoint.
func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if subtle.ConstantTimeCompare([]byte(token), h.token) != 1 {
		h.logger.Warn("Unauthorized WebSocket connection attempt")
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.logger.Error("WebSocket upgrade failed", "error", err)
		return
	}
	conn.SetReadLimit(protocol.MaxWebSocketMessageBytes)

	cs := &ClientState{
		conn:       conn,
		sessionIDs: make(map[string]bool),
		tokens:     make(map[string]string),
	}

	h.clientsMu.Lock()
	h.clients[conn] = cs
	h.clientsMu.Unlock()

	h.logger.Info("TS client connected", "remoteAddr", r.RemoteAddr)

	defer func() {
		h.removeClient(conn)
		conn.Close()
		h.logger.Info("TS client disconnected", "remoteAddr", r.RemoteAddr)
	}()

	// Read loop: dispatch incoming messages
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				break
			}
			h.logger.Error("Error reading from TS client", "error", err)
			break
		}

		msgType, err := protocol.ParseType(data)
		if err != nil {
			h.logger.Error("Failed to parse message type", "error", err)
			continue
		}

		switch msgType {
		case protocol.TypeReady:
			if err := cs.WriteJSON(protocol.ReadyAckMessage{Type: protocol.TypeReadyAck, Version: protocol.ProtocolVersion}); err != nil {
				h.logger.Error("Failed to send ready ack", "error", err)
				continue
			}
			h.readyOnce.Do(func() {
				h.logger.Info("TS client sent ready")
				close(h.ready)
			})

		case protocol.TypeRegister:
			var msg protocol.RegisterMessage
			if err := json.Unmarshal(data, &msg); err != nil {
				h.logger.Error("Failed to parse register message", "error", err)
				continue
			}
			acks, err := h.registerSessions(cs, msg.Sessions)
			if err != nil {
				h.logger.Warn("Failed to register sessions", "error", err)
				_ = cs.WriteJSON(protocol.RequestErrorMessage{Type: protocol.TypeRequestError, RequestID: "", Message: err.Error()})
				continue
			}
			// Send ack so the client knows registration is complete
			ack := protocol.RegisterAckMessage{Type: protocol.TypeRegisterAck, Sessions: acks}
			ackData, _ := json.Marshal(ack)
			cs.writeMu.Lock()
			cs.conn.WriteMessage(websocket.TextMessage, ackData)
			cs.writeMu.Unlock()

		case protocol.TypeUnregister:
			var msg protocol.UnregisterMessage
			if err := json.Unmarshal(data, &msg); err != nil {
				h.logger.Error("Failed to parse unregister message", "error", err)
				continue
			}
			h.unregisterSessions(cs, msg.SessionIDs)

		case protocol.TypeResponse:
			var resp protocol.ProxyResponse
			if err := json.Unmarshal(data, &resp); err != nil {
				h.logger.Error("Failed to parse response", "error", err)
				continue
			}
			h.Resolve(resp.RequestID, data)

		case protocol.TypeConnectResponse:
			var resp protocol.ConnectResponse
			if err := json.Unmarshal(data, &resp); err != nil {
				h.logger.Error("Failed to parse connect response", "error", err)
				continue
			}
			h.Resolve(resp.RequestID, data)

		case protocol.TypeError:
			var errMsg protocol.ErrorMessage
			if err := json.Unmarshal(data, &errMsg); err != nil {
				h.logger.Error("Failed to parse error message", "error", err)
				continue
			}
			h.Resolve(errMsg.RequestID, data)

		case protocol.TypeRequestError:
			var errMsg protocol.RequestErrorMessage
			if err := json.Unmarshal(data, &errMsg); err != nil {
				h.logger.Error("Failed to parse request error message", "error", err)
				continue
			}
			h.Resolve(errMsg.RequestID, data)

		default:
			h.logger.Warn("Unknown message type from TS client", "type", msgType)
		}
	}
}
