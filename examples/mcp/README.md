# MCP + AI SDK Example

You can use the AI SDK with MCP to convert between MCP and AI SDK tool calls.
This example demonstrates tool conversion from both SSE and `stdio` MCP servers.

## Build

1. Create .env file with the following content (and more settings, depending on the providers you want to use):

```sh
OPENAI_API_KEY="YOUR_OPENAI_API_KEY"
```

2. Run the following commands from the root directory of the AI SDK repo:

```sh
pnpm install
pnpm build
```

## Running Examples

Start the server for a specific example

```sh
pnpm server:<folder-name>
```

Run the client for a specific example

```sh
pnpm client:<folder-name>
```

Available examples/folders:

- `sse` - SSE Transport (Legacy)
- `http` - Streamable HTTP Transport (Stateful)
- `mcp-with-auth` - MCP with authentication
- `mcp-prompts` - MCP prompts example
- `mcp-resources` - MCP resources example
- `stdio` - Stdio Transport (requires `pnpm stdio:build` first)

Example usage:

```sh
# Start the HTTP server
pnpm server:http
```

In another terminal, run the HTTP client:

```sh
pnpm client:http
```
