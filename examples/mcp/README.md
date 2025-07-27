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

## Streamable HTTP Transport (Stateful)

Start server

```sh
pnpm http:server
```

Run example:

```sh
pnpm http:client
```

## Stdio Transport

Build

```sh
pnpm stdio:build
```

Run example:

```sh
pnpm stdio:client
```

## SSE Transport (Legacy)

Start server

```sh
pnpm sse:server
```

Run example:

```sh
pnpm sse:client
```
