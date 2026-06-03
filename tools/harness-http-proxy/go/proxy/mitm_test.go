package proxy

import (
	"crypto/x509"
	"fmt"
	"net"
	"strings"
	"testing"
)

func TestLeafCertUsesIPSubjectAltName(t *testing.T) {
	ca, err := NewCA()
	if err != nil {
		t.Fatalf("new ca: %v", err)
	}

	cfg, err := ca.TLSConfigForHost("127.0.0.1")
	if err != nil {
		t.Fatalf("tls config: %v", err)
	}
	if len(cfg.Certificates) != 1 {
		t.Fatalf("expected one certificate, got %d", len(cfg.Certificates))
	}

	leaf, err := x509.ParseCertificate(cfg.Certificates[0].Certificate[0])
	if err != nil {
		t.Fatalf("parse leaf certificate: %v", err)
	}

	if len(leaf.DNSNames) != 0 {
		t.Fatalf("expected no DNS SANs for IP host, got %v", leaf.DNSNames)
	}

	ip := net.ParseIP("127.0.0.1")
	if ip == nil {
		t.Fatal("failed to parse expected IP")
	}
	if len(leaf.IPAddresses) != 1 || !leaf.IPAddresses[0].Equal(ip) {
		t.Fatalf("expected IP SAN %v, got %v", ip, leaf.IPAddresses)
	}
}

func TestLeafCertCacheIsBounded(t *testing.T) {
	ca, err := NewCA()
	if err != nil {
		t.Fatalf("new ca: %v", err)
	}

	for i := 0; i < maxLeafCertCacheEntries+10; i++ {
		hostname := fmt.Sprintf("host-%03d.example.com", i)
		if _, err := ca.TLSConfigForHost(hostname); err != nil {
			t.Fatalf("tls config for %s: %v", hostname, err)
		}
	}

	ca.leafMu.Lock()
	cacheLen := len(ca.leafCache)
	_, oldestPresent := ca.leafCache["host-000.example.com"]
	ca.leafMu.Unlock()

	if cacheLen != maxLeafCertCacheEntries {
		t.Fatalf("cache length = %d, want %d", cacheLen, maxLeafCertCacheEntries)
	}
	if oldestPresent {
		t.Fatal("oldest host was not evicted from leaf certificate cache")
	}
}

func TestLeafCertRejectsOverlongHost(t *testing.T) {
	ca, err := NewCA()
	if err != nil {
		t.Fatalf("new ca: %v", err)
	}

	hostname := strings.Repeat("a", maxLeafCertHostnameLength+1)
	if _, err := ca.TLSConfigForHost(hostname); err == nil {
		t.Fatal("expected overlong hostname to be rejected")
	}
}
