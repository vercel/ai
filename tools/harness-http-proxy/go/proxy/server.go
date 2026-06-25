package proxy

import (
	"bufio"
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/textproto"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/vercel/sandbox/http-proxy-server/protocol"
	"github.com/vercel/sandbox/http-proxy-server/ws"
)

const requestTimeout = 30 * time.Second

var (
	errProxyRequestBodyTooLarge  = errors.New("request body exceeds proxy limit")
	errProxyResponseBodyTooLarge = errors.New("response body exceeds proxy limit")
)

// Server is the HTTP proxy that listens on localhost.
// Programs inside the sandbox set HTTP_PROXY to point here.
type Server struct {
	Port     int
	CA       *CA
	hub      *ws.Hub
	logger   *slog.Logger
	server   *http.Server
	listener net.Listener
}

func NewServer(logger *slog.Logger, hub *ws.Hub, ca *CA, port int) (*Server, error) {
	s := &Server{
		hub:    hub,
		logger: logger,
		CA:     ca,
	}

	addr := fmt.Sprintf("127.0.0.1:%d", port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("listening on %s: %v", addr, err)
	}

	s.Port = ln.Addr().(*net.TCPAddr).Port
	s.listener = ln
	s.server = &http.Server{
		Handler:      s,
		ReadTimeout:  requestTimeout + 5*time.Second,
		WriteTimeout: requestTimeout + 5*time.Second,
	}

	return s, nil
}

func (s *Server) ListenAndServe() error {
	return s.server.Serve(s.listener)
}

// ServeHTTP handles both plain HTTP proxy requests and CONNECT tunneling.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodConnect {
		s.handleConnect(w, r)
		return
	}
	s.handleHTTP(w, r)
}

func (s *Server) handleHTTP(w http.ResponseWriter, r *http.Request) {
	sessionCredentials := ExtractSessionCredentials(r.Header.Get("Proxy-Authorization"))
	sessionID := sessionCredentials.SessionID
	requestID := uuid.New().String()

	logger := s.logger.With("requestId", requestID, "sessionId", sessionID, "method", r.Method, "url", r.URL.String())
	logger.Debug("Proxying HTTP request")

	var bodyBase64 string
	if r.Body != nil {
		bodyBytes, err := readLimitedBody(r.Body)
		if err != nil {
			logger.Error("Failed to read request body", "error", err)
			if errors.Is(err, errProxyRequestBodyTooLarge) {
				http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
				return
			}
			http.Error(w, "failed to read body", http.StatusBadGateway)
			return
		}
		if len(bodyBytes) > 0 {
			bodyBase64 = base64.StdEncoding.EncodeToString(bodyBytes)
		}
	}

	headers := cloneHeadersWithoutHopByHop(r.Header)

	msg := protocol.ProxyRequest{
		Type:      protocol.TypeRequest,
		RequestID: requestID,
		SessionID: sessionID,
		Method:    r.Method,
		URL:       r.URL.String(),
		Headers:   headers,
		Body:      bodyBase64,
	}

	respData, err := s.hub.SendToSessionAndWait(sessionID, sessionCredentials.Token, requestID, msg, requestTimeout)
	if err != nil {
		logger.Error("Failed to get response from TS client", "error", err)
		http.Error(w, "proxy error: "+err.Error(), http.StatusBadGateway)
		return
	}

	msgType, _ := protocol.ParseType(respData)
	if msgType == protocol.TypeError || msgType == protocol.TypeRequestError {
		message := parseProxyErrorMessage(respData, msgType)
		logger.Error("TS client returned error", "message", message)
		http.Error(w, message, http.StatusBadGateway)
		return
	}

	var resp protocol.ProxyResponse
	if err := json.Unmarshal(respData, &resp); err != nil {
		logger.Error("Failed to parse response", "error", err)
		http.Error(w, "invalid response from handler", http.StatusBadGateway)
		return
	}

	var bodyBytes []byte
	if resp.Body != "" {
		var err error
		bodyBytes, err = decodeLimitedBase64Body(resp.Body)
		if err != nil {
			logger.Error("Failed to decode response body", "error", err)
			if errors.Is(err, errProxyResponseBodyTooLarge) {
				http.Error(w, "response body too large", http.StatusBadGateway)
				return
			}
			http.Error(w, "invalid response body", http.StatusBadGateway)
			return
		}
	}

	// Write response headers
	copyHeadersWithoutHopByHop(w.Header(), resp.Headers)

	w.WriteHeader(resp.Status)

	if len(bodyBytes) > 0 {
		w.Write(bodyBytes)
	}
}

func (s *Server) handleConnect(w http.ResponseWriter, r *http.Request) {
	sessionCredentials := ExtractSessionCredentials(r.Header.Get("Proxy-Authorization"))
	sessionID := sessionCredentials.SessionID

	// Extract hostname (strip port)
	hostname := r.Host
	if h, _, err := net.SplitHostPort(hostname); err == nil {
		hostname = h
	}

	logger := s.logger.With("sessionId", sessionID, "host", r.Host, "hostname", hostname)
	logger.Debug("Proxying CONNECT request")

	// Ask the handler whether to allow this CONNECT
	connectRequestID := uuid.New().String()
	msg := protocol.ConnectRequest{
		Type:      protocol.TypeConnect,
		RequestID: connectRequestID,
		SessionID: sessionID,
		Host:      r.Host,
	}

	respData, err := s.hub.SendToSessionAndWait(sessionID, sessionCredentials.Token, connectRequestID, msg, requestTimeout)
	if err != nil {
		logger.Error("Failed to get connect response", "error", err)
		http.Error(w, "proxy error", http.StatusBadGateway)
		return
	}

	msgType, _ := protocol.ParseType(respData)
	if msgType == protocol.TypeError || msgType == protocol.TypeRequestError {
		http.Error(w, parseProxyErrorMessage(respData, msgType), http.StatusBadGateway)
		return
	}

	var resp protocol.ConnectResponse
	if err := json.Unmarshal(respData, &resp); err != nil {
		logger.Error("Failed to parse connect response", "error", err)
		http.Error(w, "invalid response", http.StatusBadGateway)
		return
	}

	if !resp.Allow {
		http.Error(w, "CONNECT denied by proxy handler", http.StatusForbidden)
		return
	}

	// MITM: hijack the connection and do TLS termination
	hijacker, ok := w.(http.Hijacker)
	if !ok {
		logger.Error("ResponseWriter does not support hijacking")
		http.Error(w, "hijack not supported", http.StatusInternalServerError)
		return
	}

	clientConn, _, err := hijacker.Hijack()
	if err != nil {
		logger.Error("Failed to hijack connection", "error", err)
		return
	}
	defer clientConn.Close()

	// Tell the client the tunnel is established
	clientConn.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n"))

	// Generate a TLS cert for this hostname and do a TLS handshake
	tlsConfig, err := s.CA.TLSConfigForHost(hostname)
	if err != nil {
		logger.Error("Failed to generate TLS config", "error", err, "hostname", hostname)
		return
	}

	tlsConn := tls.Server(clientConn, tlsConfig)
	if err := tlsConn.Handshake(); err != nil {
		logger.Error("TLS handshake failed", "error", err)
		return
	}
	defer tlsConn.Close()

	// Read HTTP requests from the decrypted TLS connection
	reader := bufio.NewReader(tlsConn)
	for {
		req, err := http.ReadRequest(reader)
		if err != nil {
			if err != io.EOF {
				logger.Debug("Error reading request from TLS conn", "error", err)
			}
			return
		}

		// Reconstruct the full URL (the request inside TLS has a relative path)
		if !strings.HasPrefix(req.URL.String(), "http") {
			req.URL.Scheme = "https"
			req.URL.Host = r.Host
		}

		s.handleDecryptedRequest(logger, sessionID, sessionCredentials.Token, tlsConn, req)
	}
}

// handleDecryptedRequest handles an HTTP request read from a decrypted TLS connection.
// It serializes the request, sends it to the JS handler, and writes the response back.
func (s *Server) handleDecryptedRequest(logger *slog.Logger, sessionID string, sessionToken string, w io.Writer, r *http.Request) {
	requestID := uuid.New().String()
	logger = logger.With("requestId", requestID, "method", r.Method, "url", r.URL.String())
	logger.Debug("Proxying decrypted HTTPS request")

	var bodyBase64 string
	if r.Body != nil {
		bodyBytes, err := readLimitedBody(r.Body)
		if err != nil {
			logger.Error("Failed to read request body", "error", err)
			if errors.Is(err, errProxyRequestBodyTooLarge) {
				writeHTTPResponse(w, 413, "request body too large")
				return
			}
			writeHTTPResponse(w, 502, "failed to read body")
			return
		}
		if len(bodyBytes) > 0 {
			bodyBase64 = base64.StdEncoding.EncodeToString(bodyBytes)
		}
	}

	headers := cloneHeadersWithoutHopByHop(r.Header)

	msg := protocol.ProxyRequest{
		Type:      protocol.TypeRequest,
		RequestID: requestID,
		SessionID: sessionID,
		Method:    r.Method,
		URL:       r.URL.String(),
		Headers:   headers,
		Body:      bodyBase64,
	}

	respData, err := s.hub.SendToSessionAndWait(sessionID, sessionToken, requestID, msg, requestTimeout)
	if err != nil {
		logger.Error("Failed to get response from handler", "error", err)
		writeHTTPResponse(w, 502, "proxy error: "+err.Error())
		return
	}

	msgType, _ := protocol.ParseType(respData)
	if msgType == protocol.TypeError || msgType == protocol.TypeRequestError {
		writeHTTPResponse(w, 502, parseProxyErrorMessage(respData, msgType))
		return
	}

	var proxyResp protocol.ProxyResponse
	if err := json.Unmarshal(respData, &proxyResp); err != nil {
		logger.Error("Failed to parse response", "error", err)
		writeHTTPResponse(w, 502, "invalid response from handler")
		return
	}

	// Build and write the HTTP response
	var body []byte
	if proxyResp.Body != "" {
		body, err = decodeLimitedBase64Body(proxyResp.Body)
		if err != nil {
			logger.Error("Failed to decode response body", "error", err)
			if errors.Is(err, errProxyResponseBodyTooLarge) {
				writeHTTPResponse(w, 502, "response body too large")
				return
			}
			writeHTTPResponse(w, 502, "invalid response body")
			return
		}
	}

	resp := &http.Response{
		StatusCode:    proxyResp.Status,
		ProtoMajor:    1,
		ProtoMinor:    1,
		Header:        make(http.Header),
		ContentLength: int64(len(body)),
	}
	copyHeadersWithoutHopByHop(resp.Header, proxyResp.Headers)
	if body != nil {
		resp.Body = io.NopCloser(bytes.NewReader(body))
	}
	resp.Write(w)
}

func readLimitedBody(body io.Reader) ([]byte, error) {
	limited := &io.LimitedReader{R: body, N: protocol.MaxBodyBytes + 1}
	bodyBytes, err := io.ReadAll(limited)
	if err != nil {
		return nil, err
	}
	if int64(len(bodyBytes)) > protocol.MaxBodyBytes {
		return nil, errProxyRequestBodyTooLarge
	}
	return bodyBytes, nil
}

func decodeLimitedBase64Body(encoded string) ([]byte, error) {
	if int64(len(encoded)) > protocol.MaxEncodedBodyBytes {
		return nil, errProxyResponseBodyTooLarge
	}
	body, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > protocol.MaxBodyBytes {
		return nil, errProxyResponseBodyTooLarge
	}
	return body, nil
}

func writeHTTPResponse(w io.Writer, status int, body string) {
	resp := &http.Response{
		StatusCode:    status,
		ProtoMajor:    1,
		ProtoMinor:    1,
		Header:        make(http.Header),
		ContentLength: int64(len(body)),
		Body:          io.NopCloser(strings.NewReader(body)),
	}
	resp.Header.Set("Content-Type", "text/plain")
	resp.Write(w)
}

func parseProxyErrorMessage(respData []byte, msgType string) string {
	switch msgType {
	case protocol.TypeRequestError:
		var errMsg protocol.RequestErrorMessage
		if err := json.Unmarshal(respData, &errMsg); err == nil && errMsg.Message != "" {
			return errMsg.Message
		}
	default:
		var errMsg protocol.ErrorMessage
		if err := json.Unmarshal(respData, &errMsg); err == nil && errMsg.Message != "" {
			return errMsg.Message
		}
	}

	return "proxy handler failed"
}

func cloneHeadersWithoutHopByHop(src http.Header) map[string][]string {
	cloned := make(http.Header, len(src))
	for key, values := range src {
		cloned[textproto.CanonicalMIMEHeaderKey(key)] = append([]string(nil), values...)
	}

	stripHopByHopHeaders(cloned)

	headers := make(map[string][]string, len(cloned))
	for key, values := range cloned {
		headers[key] = values
	}
	return headers
}

func copyHeadersWithoutHopByHop(dst http.Header, src map[string][]string) {
	headers := make(http.Header, len(src))
	for key, values := range src {
		headers[textproto.CanonicalMIMEHeaderKey(key)] = append([]string(nil), values...)
	}

	stripHopByHopHeaders(headers)
	for key, values := range headers {
		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

func stripHopByHopHeaders(header http.Header) {
	hopByHop := map[string]struct{}{
		"Connection":          {},
		"Keep-Alive":          {},
		"Proxy-Authenticate":  {},
		"Proxy-Authorization": {},
		"Proxy-Connection":    {},
		"Te":                  {},
		"Trailer":             {},
		"Transfer-Encoding":   {},
		"Upgrade":             {},
	}

	for _, connectionValue := range header.Values("Connection") {
		for _, token := range strings.Split(connectionValue, ",") {
			canonical := textproto.CanonicalMIMEHeaderKey(strings.TrimSpace(token))
			if canonical != "" {
				hopByHop[canonical] = struct{}{}
			}
		}
	}

	for key := range hopByHop {
		header.Del(key)
	}
}
