# `@vercel/http-proxy-server`

Go binary that runs inside the sandbox to intercept all outbound HTTP/HTTPS
traffic. It bridges between the sandbox network and the harness via WebSocket,
enabling HTTP proxy interception, network policy control, and request forwarding.

This is an internal component used by `@agent-harness-experimental/channel`. It is not
intended for direct use.

## Architecture

The proxy server runs as a process inside the Vercel Sandbox and:

1. Listens on a local HTTP proxy port (default `41007`)
2. Connects to the harness via WebSocket
3. Intercepts outbound HTTP requests and forwards them over WebSocket
4. Handles HTTPS CONNECT tunneling decisions
5. Writes connection metadata to `/tmp/vercel/http-proxy/config.json`

## CLI Flags

| Flag           | Default        | Description                      |
| -------------- | -------------- | -------------------------------- |
| `--ws-port`    | —              | WebSocket server port (required) |
| `--proxy-port` | `41007`        | HTTP proxy listen port           |
| `--token`      | auto-generated | Authentication token             |
| `--debug`      | `false`        | Enable debug logging             |

## Building

```bash
# Build Go binaries and install script
pnpm build

# Build binaries only
pnpm build:binaries

# Run Go tests
pnpm test
```

The build produces a Linux x86_64 binary for use inside the sandbox environment.
