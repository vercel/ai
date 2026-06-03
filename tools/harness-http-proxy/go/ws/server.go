package ws

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"
)

type Server struct {
	Port       int
	Token      string
	Hub        *Hub
	httpServer *http.Server
	listener   net.Listener
}

func generateToken() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return base64.URLEncoding.EncodeToString(bytes)
}

func NewServer(logger *slog.Logger, token string, port int) (*Server, error) {
	if token == "" {
		token = generateToken()
	}

	hub := NewHub(token, logger)

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", hub.HandleWebSocket)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	addr := fmt.Sprintf(":%d", port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("listening on %s: %v", addr, err)
	}

	httpServer := &http.Server{
		Handler:      mux,
		ReadTimeout:  120 * time.Second,
		WriteTimeout: 120 * time.Second,
	}

	return &Server{
		Port:       ln.Addr().(*net.TCPAddr).Port,
		Token:      token,
		Hub:        hub,
		httpServer: httpServer,
		listener:   ln,
	}, nil
}

func (s *Server) ListenAndServe() error {
	return s.httpServer.Serve(s.listener)
}
