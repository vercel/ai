#!/bin/bash

set -e

if [ "$VERCEL_URL" != "" ] && ! command -v go &>/dev/null; then
  curl https://raw.githubusercontent.com/canha/golang-tools-install-script/refs/heads/master/goinstall.sh | bash
  source "$HOME/.bashrc"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WS_PROXY_BIN="$SCRIPT_DIR/../ws-proxy/bin"

mkdir -p "$WS_PROXY_BIN" public

PIDS=()
go build -o http-proxy-server -ldflags "-w" &
PIDS+=($!)
GOOS="linux" GOARCH="amd64" go build -o public/linux-x86_64 -ldflags "-w" &
PIDS+=($!)
GOOS="linux" GOARCH="arm64" go build -o public/linux-arm64 -ldflags "-w" &
PIDS+=($!)

for PID in "${PIDS[@]}"; do
  wait "$PID"
done

# Copy to ws-proxy package for use by sandbox-adapter
cp public/linux-x86_64 "$WS_PROXY_BIN/http-proxy-server-linux-x86_64"
cp public/linux-arm64 "$WS_PROXY_BIN/http-proxy-server-linux-arm64"
echo "Binaries copied to $WS_PROXY_BIN"
