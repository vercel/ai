package proxy

import (
	"bufio"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/vercel/sandbox/http-proxy-server/protocol"
	"github.com/vercel/sandbox/http-proxy-server/ws"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelDebug}))
}

// startTestStack spins up a WS server + HTTP proxy connected to the same hub.
// Returns the proxy port, WS URL, and a cleanup function.
func startTestStack(t *testing.T) (proxyPort int, wsURL string, hub *ws.Hub) {
	t.Helper()

	logger := testLogger()
	token := "test-token"

	// Create WS server
	wsServer, err := ws.NewServer(logger, token, 0)
	if err != nil {
		t.Fatalf("create ws server: %v", err)
	}
	hub = wsServer.Hub

	go wsServer.ListenAndServe()
	// Give it a moment to start
	time.Sleep(50 * time.Millisecond)

	// Create CA and proxy server
	ca, err := NewCA()
	if err != nil {
		t.Fatalf("create CA: %v", err)
	}
	proxyServer, err := NewServer(logger, hub, ca, 0)
	if err != nil {
		t.Fatalf("create proxy server: %v", err)
	}
	proxyPort = proxyServer.Port

	go proxyServer.ListenAndServe()
	time.Sleep(50 * time.Millisecond)

	wsURL = fmt.Sprintf("ws://localhost:%d/ws?token=%s", wsServer.Port, token)
	return
}

// connectMockClient connects a WebSocket client to the hub, sends ready, and registers sessions.
func connectMockClient(t *testing.T, wsURL string, sessionIDs ...string) *websocket.Conn {
	t.Helper()

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial ws: %v", err)
	}

	// Send ready
	ready, _ := json.Marshal(protocol.ReadyMessage{Type: protocol.TypeReady})
	conn.WriteMessage(websocket.TextMessage, ready)

	// Register sessions
	if len(sessionIDs) > 0 {
		sessions := make([]protocol.SessionRegistration, 0, len(sessionIDs))
		for _, sessionID := range sessionIDs {
			sessions = append(sessions, protocol.SessionRegistration{SessionID: sessionID, Token: sessionToken(sessionID)})
		}
		reg, _ := json.Marshal(protocol.RegisterMessage{Type: protocol.TypeRegister, Sessions: sessions})
		conn.WriteMessage(websocket.TextMessage, reg)
	}
	time.Sleep(50 * time.Millisecond)
	return conn
}

func sessionToken(sessionID string) string {
	return "token-" + sessionID
}

func TestReadLimitedBodyRejectsOversizedBody(t *testing.T) {
	body := strings.NewReader(strings.Repeat("x", int(protocol.MaxBodyBytes)+1))

	_, err := readLimitedBody(body)
	if !errors.Is(err, errProxyRequestBodyTooLarge) {
		t.Fatalf("error: got %v, want errProxyRequestBodyTooLarge", err)
	}
}

func TestDecodeLimitedBase64BodyRejectsOversizedBody(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString([]byte(strings.Repeat("x", int(protocol.MaxBodyBytes)+1)))

	_, err := decodeLimitedBase64Body(encoded)
	if !errors.Is(err, errProxyResponseBodyTooLarge) {
		t.Fatalf("error: got %v, want errProxyResponseBodyTooLarge", err)
	}
}

// readRequest reads a ProxyRequest from the WebSocket, skipping control messages
// like register-ack that may arrive first.
func readRequest(t *testing.T, conn *websocket.Conn) protocol.ProxyRequest {
	t.Helper()
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("read ws message: %v", err)
		}
		msgType, _ := protocol.ParseType(data)
		if msgType == protocol.TypeRequest {
			var req protocol.ProxyRequest
			if err := json.Unmarshal(data, &req); err != nil {
				t.Fatalf("unmarshal request: %v (data: %s)", err, string(data))
			}
			return req
		}
		// Skip control messages (register-ack, etc.)
	}
}

// sendResponse sends a ProxyResponse back through the WebSocket.
func sendResponse(t *testing.T, conn *websocket.Conn, requestID string, status int, body string) {
	t.Helper()
	var bodyBase64 string
	if body != "" {
		bodyBase64 = base64.StdEncoding.EncodeToString([]byte(body))
	}
	resp := protocol.ProxyResponse{
		Type:      protocol.TypeResponse,
		RequestID: requestID,
		Status:    status,
		Headers:   map[string][]string{"X-Test": {"passed"}},
		Body:      bodyBase64,
	}
	data, _ := json.Marshal(resp)
	conn.WriteMessage(websocket.TextMessage, data)
}

func TestProxyHTTPRequest(t *testing.T) {
	proxyPort, wsURL, _ := startTestStack(t)
	wsConn := connectMockClient(t, wsURL, "my-session")
	defer wsConn.Close()

	// Make a proxied HTTP request in a goroutine
	done := make(chan *http.Response, 1)
	go func() {
		proxyURL := fmt.Sprintf("http://my-session:%s@127.0.0.1:%d", sessionToken("my-session"), proxyPort)
		transport := &http.Transport{
			Proxy: func(r *http.Request) (*url.URL, error) {
				return url.Parse(proxyURL)
			},
		}
		client := &http.Client{Transport: transport}
		resp, err := client.Get("http://example.com/test")
		if err != nil {
			t.Errorf("proxy request failed: %v", err)
			done <- nil
			return
		}
		done <- resp
	}()

	// Read the proxied request from WS
	req := readRequest(t, wsConn)
	if req.SessionID != "my-session" {
		t.Errorf("sessionId: got %q, want %q", req.SessionID, "my-session")
	}
	if req.Method != "GET" {
		t.Errorf("method: got %q, want GET", req.Method)
	}
	if !strings.Contains(req.URL, "example.com/test") {
		t.Errorf("url: got %q, want to contain example.com/test", req.URL)
	}

	// Send response back
	sendResponse(t, wsConn, req.RequestID, 200, "hello proxy")

	resp := <-done
	if resp == nil {
		t.Fatal("no response received")
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Errorf("status: got %d, want 200", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "hello proxy" {
		t.Errorf("body: got %q, want %q", string(body), "hello proxy")
	}
	if resp.Header.Get("X-Test") != "passed" {
		t.Errorf("header X-Test: got %q, want %q", resp.Header.Get("X-Test"), "passed")
	}
}

func TestProxyPOSTWithBody(t *testing.T) {
	proxyPort, wsURL, _ := startTestStack(t)
	wsConn := connectMockClient(t, wsURL, "post-session")
	defer wsConn.Close()

	done := make(chan *http.Response, 1)
	go func() {
		proxyURL := fmt.Sprintf("http://post-session:%s@127.0.0.1:%d", sessionToken("post-session"), proxyPort)
		transport := &http.Transport{
			Proxy: func(r *http.Request) (*url.URL, error) {
				return url.Parse(proxyURL)
			},
		}
		client := &http.Client{Transport: transport}
		resp, err := client.Post("http://example.com/api", "text/plain", strings.NewReader("request-body"))
		if err != nil {
			t.Errorf("proxy POST failed: %v", err)
			done <- nil
			return
		}
		done <- resp
	}()

	req := readRequest(t, wsConn)
	if req.Method != "POST" {
		t.Errorf("method: got %q, want POST", req.Method)
	}
	// Decode body
	bodyBytes, err := base64.StdEncoding.DecodeString(req.Body)
	if err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if string(bodyBytes) != "request-body" {
		t.Errorf("body: got %q, want %q", string(bodyBytes), "request-body")
	}

	sendResponse(t, wsConn, req.RequestID, 201, "created")

	resp := <-done
	if resp == nil {
		t.Fatal("no response")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 201 {
		t.Errorf("status: got %d, want 201", resp.StatusCode)
	}
}

func TestProxyErrorResponse(t *testing.T) {
	proxyPort, wsURL, _ := startTestStack(t)
	wsConn := connectMockClient(t, wsURL, "err-session")
	defer wsConn.Close()

	done := make(chan *http.Response, 1)
	go func() {
		proxyURL := fmt.Sprintf("http://err-session:%s@127.0.0.1:%d", sessionToken("err-session"), proxyPort)
		transport := &http.Transport{
			Proxy: func(r *http.Request) (*url.URL, error) {
				return url.Parse(proxyURL)
			},
		}
		client := &http.Client{Transport: transport}
		resp, err := client.Get("http://example.com/fail")
		if err != nil {
			t.Errorf("request failed: %v", err)
			done <- nil
			return
		}
		done <- resp
	}()

	req := readRequest(t, wsConn)

	// Send error response
	errMsg := protocol.ErrorMessage{
		Type:      protocol.TypeError,
		RequestID: req.RequestID,
		Message:   "handler denied",
	}
	data, _ := json.Marshal(errMsg)
	wsConn.WriteMessage(websocket.TextMessage, data)

	resp := <-done
	if resp == nil {
		t.Fatal("no response")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 502 {
		t.Errorf("status: got %d, want 502", resp.StatusCode)
	}
}

func TestProxyRequestErrorResponse(t *testing.T) {
	proxyPort, wsURL, _ := startTestStack(t)
	wsConn := connectMockClient(t, wsURL, "request-error-session")
	defer wsConn.Close()

	done := make(chan *http.Response, 1)
	go func() {
		proxyURL := fmt.Sprintf("http://request-error-session:%s@127.0.0.1:%d", sessionToken("request-error-session"), proxyPort)
		transport := &http.Transport{
			Proxy: func(r *http.Request) (*url.URL, error) {
				return url.Parse(proxyURL)
			},
		}
		client := &http.Client{Transport: transport}
		resp, err := client.Get("http://example.com/request-error")
		if err != nil {
			t.Errorf("request failed: %v", err)
			done <- nil
			return
		}
		done <- resp
	}()

	req := readRequest(t, wsConn)

	errMsg := protocol.RequestErrorMessage{
		Type:      protocol.TypeRequestError,
		RequestID: req.RequestID,
		Message:   "No handler for session request-error-session",
	}
	data, _ := json.Marshal(errMsg)
	wsConn.WriteMessage(websocket.TextMessage, data)

	resp := <-done
	if resp == nil {
		t.Fatal("no response")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 502 {
		t.Errorf("status: got %d, want 502", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), errMsg.Message) {
		t.Fatalf("body: got %q, want to contain %q", string(body), errMsg.Message)
	}
}

func TestProxyStripsHopByHopHeaders(t *testing.T) {
	proxyPort, wsURL, _ := startTestStack(t)
	wsConn := connectMockClient(t, wsURL, "hop-by-hop-session")
	defer wsConn.Close()

	done := make(chan *http.Response, 1)
	go func() {
		proxyURL := fmt.Sprintf("http://hop-by-hop-session:%s@127.0.0.1:%d", sessionToken("hop-by-hop-session"), proxyPort)
		transport := &http.Transport{
			Proxy: func(r *http.Request) (*url.URL, error) {
				return url.Parse(proxyURL)
			},
		}
		client := &http.Client{Transport: transport}

		req, err := http.NewRequest("GET", "http://example.com/headers", nil)
		if err != nil {
			t.Errorf("new request: %v", err)
			done <- nil
			return
		}
		req.Header.Set("Connection", "keep-alive, X-Remove")
		req.Header.Set("Keep-Alive", "timeout=5")
		req.Header.Set("Proxy-Connection", "keep-alive")
		req.Header.Set("X-Remove", "1")
		req.Header.Set("X-Keep", "1")

		resp, err := client.Do(req)
		if err != nil {
			t.Errorf("proxy request failed: %v", err)
			done <- nil
			return
		}
		done <- resp
	}()

	req := readRequest(t, wsConn)
	if req.Headers["Connection"] != nil {
		t.Fatalf("connection header should be stripped: %#v", req.Headers["Connection"])
	}
	if req.Headers["Keep-Alive"] != nil {
		t.Fatalf("keep-alive header should be stripped: %#v", req.Headers["Keep-Alive"])
	}
	if req.Headers["Proxy-Connection"] != nil {
		t.Fatalf("proxy-connection header should be stripped: %#v", req.Headers["Proxy-Connection"])
	}
	if req.Headers["X-Remove"] != nil {
		t.Fatalf("connection-nominated header should be stripped: %#v", req.Headers["X-Remove"])
	}
	if got := req.Headers["X-Keep"]; len(got) != 1 || got[0] != "1" {
		t.Fatalf("x-keep header missing after sanitization: %#v", got)
	}

	resp := protocol.ProxyResponse{
		Type:      protocol.TypeResponse,
		RequestID: req.RequestID,
		Status:    200,
		Headers: map[string][]string{
			"Connection":        {"X-Response-Remove"},
			"X-Response-Remove": {"1"},
			"X-Response-Keep":   {"1"},
		},
		Body: base64.StdEncoding.EncodeToString([]byte("ok")),
	}
	data, _ := json.Marshal(resp)
	wsConn.WriteMessage(websocket.TextMessage, data)

	httpResp := <-done
	if httpResp == nil {
		t.Fatal("no response")
	}
	defer httpResp.Body.Close()
	if httpResp.Header.Get("X-Response-Remove") != "" {
		t.Fatalf("response hop-by-hop header should be stripped, got %q", httpResp.Header.Get("X-Response-Remove"))
	}
	if httpResp.Header.Get("X-Response-Keep") != "1" {
		t.Fatalf("response keep header missing, got %q", httpResp.Header.Get("X-Response-Keep"))
	}
}

func TestProxyCONNECTMITM(t *testing.T) {
	proxyPort, wsURL, hub := startTestStack(t)
	wsConn := connectMockClient(t, wsURL, "connect-session")
	defer wsConn.Close()

	// Get the CA cert from the proxy server to build a TLS trust pool
	// We need to find the CA through the hub → proxy path. For testing,
	// extract it from the startTestStack's proxyServer.
	// Instead, we'll just skip TLS verification in the test client.

	done := make(chan string, 1)
	go func() {
		conn, err := net.Dial("tcp", fmt.Sprintf("127.0.0.1:%d", proxyPort))
		if err != nil {
			done <- "dial error: " + err.Error()
			return
		}
		defer conn.Close()

		// Send CONNECT
		authValue := base64.StdEncoding.EncodeToString([]byte("connect-session:" + sessionToken("connect-session")))
		fmt.Fprintf(conn, "CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\nProxy-Authorization: Basic %s\r\n\r\n", authValue)

		// Read 200 Connection Established
		buf := make([]byte, 4096)
		n, _ := conn.Read(buf)
		response := string(buf[:n])
		if !strings.Contains(response, "200") {
			done <- "no 200: " + response
			return
		}

		// Do TLS handshake (skip verify since we don't have the CA cert pool in-test)
		tlsConn := tls.Client(conn, &tls.Config{
			InsecureSkipVerify: true,
			ServerName:         "example.com",
		})
		if err := tlsConn.Handshake(); err != nil {
			done <- "tls handshake: " + err.Error()
			return
		}
		defer tlsConn.Close()

		// Send an HTTP request over the TLS connection
		fmt.Fprintf(tlsConn, "GET /path HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n")

		// Read the full HTTP response
		resp, err := http.ReadResponse(bufio.NewReader(tlsConn), nil)
		if err != nil {
			done <- "read response: " + err.Error()
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		done <- string(body)
	}()

	// Read CONNECT request from WS (skip control messages) → allow it
	wsConn.SetReadDeadline(time.Now().Add(5 * time.Second))
	var connectReq protocol.ConnectRequest
	for {
		_, data, err := wsConn.ReadMessage()
		if err != nil {
			t.Fatalf("read ws connect: %v", err)
		}
		msgType, _ := protocol.ParseType(data)
		if msgType == protocol.TypeConnect {
			json.Unmarshal(data, &connectReq)
			break
		}
	}

	allowResp := protocol.ConnectResponse{
		Type:      protocol.TypeConnectResponse,
		RequestID: connectReq.RequestID,
		Allow:     true,
	}
	respData, _ := json.Marshal(allowResp)
	wsConn.WriteMessage(websocket.TextMessage, respData)

	// Now read the inner HTTP request (MITM'd) — use readRequest which skips control messages
	proxyReq := readRequest(t, wsConn)

	if proxyReq.Method != "GET" {
		t.Errorf("method: got %q, want GET", proxyReq.Method)
	}
	if !strings.Contains(proxyReq.URL, "example.com") || !strings.Contains(proxyReq.URL, "/path") {
		t.Errorf("url: got %q, want to contain example.com and /path", proxyReq.URL)
	}

	// Send response
	body := base64.StdEncoding.EncodeToString([]byte("mitm-works"))
	httpResp := protocol.ProxyResponse{
		Type:      protocol.TypeResponse,
		RequestID: proxyReq.RequestID,
		Status:    200,
		Body:      body,
	}
	httpRespData, _ := json.Marshal(httpResp)
	wsConn.WriteMessage(websocket.TextMessage, httpRespData)

	result := <-done
	if !strings.Contains(result, "mitm-works") {
		t.Errorf("response: got %q, want to contain 'mitm-works'", result)
	}

	_ = hub // suppress unused
}

func TestProxyCONNECTDenied(t *testing.T) {
	proxyPort, wsURL, _ := startTestStack(t)
	wsConn := connectMockClient(t, wsURL, "connect-denied-session")
	defer wsConn.Close()

	done := make(chan string, 1)
	go func() {
		conn, err := net.Dial("tcp", fmt.Sprintf("127.0.0.1:%d", proxyPort))
		if err != nil {
			done <- ""
			return
		}
		defer conn.Close()

		authValue := base64.StdEncoding.EncodeToString([]byte("connect-denied-session:" + sessionToken("connect-denied-session")))
		fmt.Fprintf(conn, "CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\nProxy-Authorization: Basic %s\r\n\r\n", authValue)

		buf := make([]byte, 4096)
		n, _ := conn.Read(buf)
		done <- string(buf[:n])
	}()

	// Read CONNECT from WS (skip control messages)
	wsConn.SetReadDeadline(time.Now().Add(5 * time.Second))
	var connectReq protocol.ConnectRequest
	for {
		_, data, err := wsConn.ReadMessage()
		if err != nil {
			t.Fatalf("read ws: %v", err)
		}
		msgType, _ := protocol.ParseType(data)
		if msgType == protocol.TypeConnect {
			json.Unmarshal(data, &connectReq)
			break
		}
	}

	// Deny
	denyResp := protocol.ConnectResponse{
		Type:      protocol.TypeConnectResponse,
		RequestID: connectReq.RequestID,
		Allow:     false,
	}
	respData, _ := json.Marshal(denyResp)
	wsConn.WriteMessage(websocket.TextMessage, respData)

	response := <-done
	if !strings.Contains(response, "403") {
		t.Errorf("expected 403, got: %s", response)
	}
}

func TestProxyNoWsClient(t *testing.T) {
	proxyPort, _, _ := startTestStack(t)
	// Don't connect a WS client

	proxyURL := fmt.Sprintf("http://session:%s@127.0.0.1:%d", sessionToken("session"), proxyPort)
	transport := &http.Transport{
		Proxy: func(r *http.Request) (*url.URL, error) {
			return url.Parse(proxyURL)
		},
	}
	client := &http.Client{
		Transport: transport,
		Timeout:   5 * time.Second,
	}
	resp, err := client.Get("http://example.com/test")
	if err != nil {
		// Connection error is expected when no WS client
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 502 {
		t.Errorf("expected 502, got %d", resp.StatusCode)
	}
}
