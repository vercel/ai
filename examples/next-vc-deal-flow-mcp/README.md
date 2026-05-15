# Next.js + AI SDK + MCP — VC Deal Flow Research

A minimal Next.js example that streams a chat response from `streamText` while
calling tools on a remote, public MCP server over Streamable HTTP.

The example uses the [GitDealFlow Signal](https://signals.gitdealflow.com)
public MCP endpoint, which exposes read-only tools for looking up GitHub-derived
engineering momentum signals on venture-backed startups. The endpoint is
no-auth and rate-limited, so the example is runnable end-to-end without
additional API keys (other than the model provider).

## What it shows

- `createMCPClient` from `@ai-sdk/mcp` with a `StreamableHTTPClientTransport`
  pointed at a remote MCP server URL
- `mcpClient.tools()` auto-discovers tools and turns them into AI SDK tools
- Wiring those tools into `streamText` and returning a UI message stream via
  `toUIMessageStreamResponse`
- Closing the MCP client in `onFinish` / `onError`

## Running

1. Add an Anthropic API key:

   ```sh
   echo 'ANTHROPIC_API_KEY="sk-ant-..."' > .env.local
   ```

2. From the AI SDK repo root:

   ```sh
   pnpm install
   pnpm build
   ```

3. From this directory:

   ```sh
   pnpm dev
   ```

4. Open http://localhost:3000 and try one of the starter prompts.

## Swap in another MCP server

Edit `app/api/research/route.ts` and change `MCP_URL` to any HTTP MCP endpoint:

```ts
const MCP_URL = 'https://your-server.example.com/mcp';
```

If the server requires auth, pass headers to the transport:

```ts
const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
  requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` } },
});
```

## Swap in another model

Replace the Anthropic provider with any other AI SDK provider, e.g.:

```ts
import { openai } from '@ai-sdk/openai';
// ...
model: openai('gpt-4o'),
```
