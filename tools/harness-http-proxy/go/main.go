package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/vercel/sandbox/http-proxy-server/protocol"
	"github.com/vercel/sandbox/http-proxy-server/proxy"
	"github.com/vercel/sandbox/http-proxy-server/ws"
)

const defaultConfigPath = "/tmp/vercel/http-proxy/config.json"

// ConnectionInfo is output to stdout as JSON for the TS client to parse.
type ConnectionInfo struct {
	WsPort    int    `json:"wsPort"`
	ProxyPort int    `json:"proxyPort"`
	Token     string `json:"token"`
	Version   string `json:"version"`
}

func main() {
	var (
		help      = flag.Bool("help", false, "Show help")
		wsPort    = flag.Int("ws-port", 0, "Port for WebSocket server (0 for auto)")
		proxyPort = flag.Int("proxy-port", 0, "Port for HTTP proxy on localhost (0 for auto)")
		token     = flag.String("token", "", "Authentication token (auto-generated if empty)")
		debug     = flag.Bool("debug", false, "Enable debug logging")
	)

	flag.Parse()

	if *help {
		printUsage()
		return
	}

	logLevel := new(slog.LevelVar)
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{
		Level: logLevel,
	}))

	if *debug {
		logLevel.Set(slog.LevelDebug)
		logger.Debug("Debug logging enabled")
	}

	// Start WebSocket server
	wsServer, err := ws.NewServer(logger.With("component", "ws"), *token, *wsPort)
	if err != nil {
		logger.Error("Failed to create WebSocket server", "error", err)
		os.Exit(1)
	}

	go func() {
		logger.Info("WebSocket server starting", "port", wsServer.Port)
		if err := wsServer.ListenAndServe(); err != nil {
			logger.Error("WebSocket server error", "error", err)
			os.Exit(1)
		}
	}()

	// Generate CA for HTTPS MITM and install in system trust store
	ca, err := proxy.NewCA()
	if err != nil {
		logger.Error("Failed to generate CA", "error", err)
		os.Exit(1)
	}

	certPath := "/etc/pki/ca-trust/source/anchors/vc-proxy-ca.pem"
	if err := os.MkdirAll(filepath.Dir(certPath), 0755); err != nil {
		logger.Warn("Failed to create cert dir (may need sudo)", "error", err)
	}
	if err := os.WriteFile(certPath, ca.CertPEM(), 0644); err != nil {
		logger.Warn("Failed to write CA cert (may need sudo)", "error", err)
	} else {
		// Update the system trust store
		cmd := exec.Command("update-ca-trust", "extract")
		if out, err := cmd.CombinedOutput(); err != nil {
			logger.Warn("Failed to update CA trust", "error", err, "output", string(out))
		} else {
			logger.Info("Installed MITM CA certificate in system trust store")
		}
	}

	// Start HTTP proxy server
	proxyServer, err := proxy.NewServer(logger.With("component", "proxy"), wsServer.Hub, ca, *proxyPort)
	if err != nil {
		logger.Error("Failed to create proxy server", "error", err)
		os.Exit(1)
	}

	// Output connection info as JSON to stdout (TS client reads this)
	info := ConnectionInfo{
		WsPort:    wsServer.Port,
		ProxyPort: proxyServer.Port,
		Token:     wsServer.Token,
		Version:   protocol.ProtocolVersion,
	}
	infoJSON, _ := json.Marshal(info)
	fmt.Println(string(infoJSON))

	// Also persist to config file so subsequent clients can connect
	if err := os.MkdirAll(filepath.Dir(defaultConfigPath), 0755); err != nil {
		logger.Error("Failed to create config directory", "error", err)
	} else if err := os.WriteFile(defaultConfigPath, infoJSON, 0644); err != nil {
		logger.Error("Failed to write config file", "error", err)
	}

	// Wait for the TS client to send "ready" before accepting proxy requests
	go func() {
		<-wsServer.Hub.Ready()
		logger.Info("TS client ready, proxy is now active")
	}()

	logger.Info("HTTP proxy server starting", "port", proxyServer.Port)
	if err := proxyServer.ListenAndServe(); err != nil {
		logger.Error("Proxy server error", "error", err)
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Printf(`HTTP Proxy Server - WebSocket Tunnel

USAGE:
    http-proxy-server [OPTIONS]

OPTIONS:
    --ws-port <port>        Port for WebSocket server (0 for auto, default: 0)
    --proxy-port <port>     Port for HTTP proxy on localhost (0 for auto, default: 0)
    --token <token>         Authentication token (auto-generated if empty)
    --debug                 Enable debug logging
    --help                  Show this help message

ARCHITECTURE:
    Programs inside the sandbox use HTTP_PROXY=http://<session>:<token>@localhost:<proxy-port>
    to route requests through this proxy. The proxy forwards each request over WebSocket
    to an external TypeScript client, which calls a per-session callback and returns the
    response.
`)
}
