package proxy

import (
	"encoding/base64"
	"strings"
)

type SessionCredentials struct {
	SessionID string
	Token     string
}

// ExtractSessionID pulls the session ID from a Proxy-Authorization header.
// The HTTP_PROXY URL is http://<sessionId>:<token>@host:port.
func ExtractSessionID(proxyAuth string) string {
	return ExtractSessionCredentials(proxyAuth).SessionID
}

// ExtractSessionCredentials pulls the session ID and per-session token from a
// Proxy-Authorization header.
func ExtractSessionCredentials(proxyAuth string) SessionCredentials {
	if proxyAuth == "" {
		return SessionCredentials{}
	}

	// Expect "Basic <base64>"
	const prefix = "Basic "
	if !strings.HasPrefix(proxyAuth, prefix) {
		return SessionCredentials{}
	}

	decoded, err := base64.StdEncoding.DecodeString(proxyAuth[len(prefix):])
	if err != nil {
		return SessionCredentials{}
	}

	// Format is "sessionId:token".
	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) == 0 {
		return SessionCredentials{}
	}
	credentials := SessionCredentials{SessionID: parts[0]}
	if len(parts) > 1 {
		credentials.Token = parts[1]
	}
	return credentials
}
