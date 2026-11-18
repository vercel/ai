# WebMCP shopping cart assistant

Browse the three products, edit quantities, or ask the shopping companion to read
and change your cart. Buttons and browser tools share the same state.

Try a conversation:

- “What's in my cart?”
- “Add two mugs.”
- “Make that three.”
- “Remove the T-shirt. What's the total now?”

Tools: `getCart`, `addToCart`, `updateCartItem`, and `removeFromCart`. Quantities
must be integers from 0 to 20; adding requires at least one unit. Cart state is
local to this tab and resets on reload. There is no checkout.

The [cookbook recipe](https://ai-sdk.dev/cookbook/next/webmcp-tools) explains the
connection and highlights `createMCPTools` on the backend.

Open Chrome DevTools Console and filter for `[WebMCP]` to see registration,
discovered definitions, the stored MCP client, tool calls, and returned results.
Expand the client logged after discovery to inspect its transport's tool registry.

The transport is imported as `Experimental_WebMCPTransport as WebMCPTransport`.
The browser API types use the same experimental import alias pattern.

## Run

1. Set `OPENAI_API_KEY` in `examples/ai-e2e-next/.env.local`.
2. From the repository root, build the local packages:
   `pnpm exec turbo build --filter=@ai-sdk/mcp... --filter=@ai-sdk/react... --filter=@ai-sdk/openai... --filter=ai...`.
3. Run `pnpm --filter @example/next-openai dev`.
4. Open `/chat/webmcp` in a browser that supports `document.modelContext.getTools`
   and `executeTool`. For local Chrome development, enable
   `chrome://flags/#enable-webmcp-testing` and restart Chrome.

## Where the code runs

```mermaid
sequenceDiagram
    participant Browser as Browser: WebMCP + MCP client
    participant Backend as Backend: AI SDK
    participant Model as Model provider
    Browser->>Backend: Message and tool definitions
    Backend->>Model: Message and tool schemas
    Model->>Backend: Call getCart
    Backend->>Browser: Forward tool call
    Browser->>Browser: MCP client calls WebMCP executeTool
    Browser->>Backend: Tool result
    Backend->>Model: Continue with result
    Model->>Backend: Cart summary
    Backend->>Browser: Display answer
```

- `cart-tools.ts` registers the site's four tools and validates their inputs.
- `use-cart-agent.ts` connects `WebMCPTransport`, forwards definitions, and
  executes calls in `useChat.onToolCall`. A ref makes cart writes visible to
  the next tool call before React renders.
- `page.tsx` renders products, editable cart items, and free-form chat.
- `app/api/chat/webmcp/route.ts` uses `createMCPTools(definitions)` to validate
  the forwarded definitions and create the model's tools. They have no
  server-side `execute` function. Passing `{ tools }` to `convertToModelMessages`
  converts returned MCP results to model content. The provider key stays here.
- `addToolOutput` and automatic chat submission return browser results to the
  backend. No additional WebSocket service is needed for this example.

The page lists tools before each request, so each model request gets the current
definitions. The transport itself does not subscribe to `toolchange` events.

Only use this demonstration endpoint in a local development environment. A
deployed application should authenticate access and apply its own policies to
browser-provided tool definitions and results.
