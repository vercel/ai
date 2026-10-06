# MCP webhook events

Three pieces work together:

1. **MCP server** - offers `comment.created` and sends signed webhooks.
2. **Your app** - subscribes with `createMCPClient` and receives events with
   `experimental_createMCPEventWebhook`.
3. **Subscription store** - shared by the client and webhook handler. It saves
   the callback URL, signing secret, and subscription state in a private file.

The store belongs to your app. The MCP server does not access your store.

## Files

Start with `client.ts`; it shows the complete application flow.

| File                | Purpose                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `client.ts`         | Create the webhook and client, list events, subscribe, publish one comment, and log the event.                            |
| `server.ts`         | Run an `@modelcontextprotocol/server` MCP server and emit `comment.created` when `publish_comment` is called.             |
| `event-store.ts`    | Provide the persistent `eventStore` used by both SDK helpers.                                                             |
| `webhook-server.ts` | Mount the webhook on Express at `http://127.0.0.1:3003/mcp-events`. In Next.js, export the SDK handler as `POST` instead. |

The server uses `McpServer` for tools and discovery, `createMcpHandler` for MCP
HTTP requests, and `toNodeHandler` from `@modelcontextprotocol/node` for Express.
The draft `events/*` methods are registered with the SDK's custom request
handlers; signed verification and webhook delivery are implemented in the demo.

## Run

Build the MCP package from the repository root:

```sh
pnpm --filter @ai-sdk/mcp build
```

Run these in two terminals from `examples/mcp`:

```sh
pnpm server:events
```

```sh
pnpm client:events
```

Expected client output:

```text
Available events: [ 'comment.created' ]
Subscribed (callback verified): sub_...
Received comment: { document_id: 'doc_123', text: 'Hello from MCP events!' }
```

Expected server output after running the client:

```text
MCP events server: http://127.0.0.1:3002/mcp
Verified callback and registered subscription: sub_...
Event acknowledged: 204
```

The client calls `client.events.experimental_list()` to discover available
events before subscribing to `comment.created`.

The app starts its webhook route before subscribing. The SDK saves a generated
secret as `delivery.secret` before contacting the MCP server. The server sends
an immediate signed verification challenge; the webhook handler loads the
saved secret and verifies and echoes the challenge automatically.

The demo then calls `publish_comment` to simulate a new comment. The server
sends one event, `onEvent` logs it, and the app unsubscribes and exits. Publishing
through an MCP tool is just how this demo triggers a change; a real server can
emit events when its underlying data changes.

No model API key, agent, queue, or background worker is needed. The file store supports one app process and persists secrets in the system
temporary directory. A deployed app with multiple instances should use shared,
private database storage scoped to one MCP server and authenticated principal.
The demo server keeps subscriptions in memory for up to 60 seconds and has no
replay. For long-lived subscriptions, call `client.events.experimental_refresh`
before `refreshBefore`. Real deliveries can be duplicated; production handlers
should deduplicate by subscription ID and event ID.

## API Reference

- [Event discovery, subscribe, refresh, and unsubscribe](https://ai-sdk.dev/docs/reference/ai-sdk-core/mcp-events)
- [Webhook handler](https://ai-sdk.dev/docs/reference/ai-sdk-core/mcp-events#webhook-handler)
- [Event types and store interface](https://ai-sdk.dev/docs/reference/ai-sdk-core/mcp-events#event-types)
