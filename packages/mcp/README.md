# AI SDK - Model Context Protocol Client

The **Model Context Protocol (MCP) client** for the
[AI SDK](https://ai-sdk.dev/docs) lets you connect to MCP servers and use their
tools with AI SDK functions like `generateText` and `streamText`.

## Setup

The MCP client is available in the `@ai-sdk/mcp` module. You can install it with

```bash
npm i @ai-sdk/mcp ai zod
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend
adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

Create an MCP client with `createMCPClient()`, fetch the server tools with
`mcpClient.tools()`, and pass them to an AI SDK call:

```ts
import { createMCPClient } from '@ai-sdk/mcp';
import { generateText, isStepCount } from 'ai';

const mcpClient = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://your-server.com/mcp',
    headers: {
      Authorization: `Bearer ${process.env.MCP_API_KEY}`,
    },
  },
});

try {
  const tools = await mcpClient.tools();

  const { text } = await generateText({
    model: 'openai/gpt-6-astra',
    tools,
    stopWhen: isStepCount(10),
    prompt: 'Use the available tools to answer the user question.',
  });

  console.log(text);
} finally {
  await mcpClient.close();
}
```

The client converts MCP tool definitions into AI SDK tools, so model calls can
use them through the standard `tools` option.

## Experimental webhook events

Use `list`, `subscribe`, `refresh`, and `unsubscribe` through
`client.experimental_events` on the same `createMCPClient` instance. Configure
`experimental_events: { store }` with private durable storage shared with
`experimental_createMCPEventWebhook`, which you mount at your callback URL.

Subscription creation persists `delivery.url` and the generated signing secret
before contacting the server, enabling signed callback verification during the
subscribe request. The receiver verifies raw request bytes and checks event
envelopes before invoking your handler. Optional callbacks let your application
validate filters and event data. Agent execution and durable deduplication
remain application concerns; closing the client does not unsubscribe.

See the [MCP Events guide](https://ai-sdk.dev/docs/ai-sdk-core/mcp-events) and the
[local server/client example](../../examples/mcp/src/events/README.md).

## Protocol versions

The client supports legacy MCP protocol versions through the `initialize`
handshake and MCP `2026-07-28` through stateless protocol discovery. The
built-in stdio transport probes with `server/discover` and falls back to the
legacy handshake when connected to an older server.

Custom transports can opt into the same negotiation by setting
`supportsProtocolVersionDiscovery` to `true`. Modern requests include the
protocol version, client capabilities, and client information in `_meta`.

For streaming responses, close the MCP client when the stream finishes:

```ts
import { createMCPClient } from '@ai-sdk/mcp';
import { streamText } from 'ai';

const mcpClient = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://your-server.com/mcp',
  },
});

const result = streamText({
  model: 'openai/gpt-6-astra',
  tools: await mcpClient.tools(),
  prompt: 'Use the available tools to answer the user question.',
  onEnd: async () => {
    await mcpClient.close();
  },
});

for await (const textPart of result.textStream) {
  process.stdout.write(textPart);
}
```

## Transports

HTTP is recommended for production deployments:

Session persistence applies only to legacy MCP protocol versions. MCP
`2026-07-28` is stateless and does not use session ids or cached initialize
results.

```ts
import { createMCPClient } from '@ai-sdk/mcp';

const savedSession = await loadMcpSession();
let currentSessionId = savedSession?.sessionId;

const mcpClient = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://your-server.com/mcp',
    initialSessionId: savedSession?.sessionId,
    initialProtocolVersion: savedSession?.initializeResult.protocolVersion,
    terminateSessionOnClose: false,
    onSessionIdChange: sessionId => {
      currentSessionId = sessionId;
    },
    onSessionExpired: sessionId => {
      if (currentSessionId === sessionId) {
        currentSessionId = undefined;
        void clearMcpSession();
      }
    },
  },
  initialInitializeResult: savedSession?.initializeResult,
});

if (currentSessionId) {
  await saveMcpSession({
    sessionId: currentSessionId,
    initializeResult: mcpClient.initializeResult,
  });
}
```

SSE is also supported for MCP servers that use Server-Sent Events:

```ts
const mcpClient = await createMCPClient({
  transport: {
    type: 'sse',
    url: 'https://your-server.com/sse',
  },
});
```

For local MCP servers, you can use stdio transport from the `@ai-sdk/mcp/mcp-stdio`
subpath:

```ts
import { createMCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';

const mcpClient = await createMCPClient({
  transport: new Experimental_StdioMCPTransport({
    command: 'node',
    args: ['server.js'],
  }),
});
```

## Documentation

Please check out the
[AI SDK MCP documentation](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools) for
more information.

Managed backends can implement `Experimental_MCPEventAdapter` and configure
`experimental_events: { adapter }` instead of a store. Its `createAdapter()`
method receives the transport URL and returns `Experimental_MCPEventOperations`
bound to the authorized account. Catalog discovery still
uses the authenticated MCP transport; subscribe/get/list/unsubscribe delegate
to the backend, which owns renewal and webhook delivery. Managed clients do not
expose `refresh()`. See the [managed subscription reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/mcp-events#managed-subscriptions).
