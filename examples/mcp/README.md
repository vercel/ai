# MCP + AI SDK Example - TODO: REVISE

You can use the AI SDK with MCP to convert between MCP and AI SDK tool calls.
This example demonstrates tool conversion from both SSE and `stdio` MCP servers.

## Usage

1. Create .env file with the following content (and more settings, depending on the providers you want to use):

```sh
OPENAI_API_KEY="YOUR_OPENAI_API_KEY"
```

2. Run the following commands from the root directory of the AI SDK repo:

```sh
pnpm install
pnpm build
```

3. Run the following command:

```sh
pnpm dev
```

4. Test the endpoint with Curl:

```sh
curl -X POST http://localhost:8080
```
