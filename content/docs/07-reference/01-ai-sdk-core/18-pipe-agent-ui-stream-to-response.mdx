---
title: pipeAgentUIStreamToResponse
description: API Reference for the pipeAgentUIStreamToResponse utility.
---

# `pipeAgentUIStreamToResponse`

The `pipeAgentUIStreamToResponse` function executes an [Agent](/docs/reference/ai-sdk-core/agent) and streams its output as a UI message stream directly to a Node.js [`ServerResponse`](https://nodejs.org/api/http.html#class-httpserverresponse) object. This is ideal for building API endpoints in Node.js servers (such as Express, Hono, or custom servers) that require low-latency, real-time UI message streaming from an Agent (e.g., for chat- or tool-use-based applications).

## Import

<Snippet
  text={`import { pipeAgentUIStreamToResponse } from "ai"`}
  prompt={false}
/>

## Usage

```ts
import { pipeAgentUIStreamToResponse } from 'ai';
import { MyCustomAgent } from './agent';

export async function handler(req, res) {
  const { messages } = JSON.parse(req.body);

  // Optional: Use abortSignal for request cancellation support
  const abortController = new AbortController();

  await pipeAgentUIStreamToResponse({
    response: res, // Node.js ServerResponse
    agent: MyCustomAgent,
    messages,
    abortSignal: abortController.signal, // optional, see notes
    // ...other optional streaming options
  });
}
```

## Parameters

<PropertiesTable
  content={[
    {
      name: 'response',
      type: 'ServerResponse',
      isRequired: true,
      description:
        'The Node.js ServerResponse object to which the UI message stream will be piped.',
    },
    {
      name: 'agent',
      type: 'Agent',
      isRequired: true,
      description:
        'The agent instance to use for streaming responses. Must implement `.stream({ prompt })` and define tools.',
    },
    {
      name: 'messages',
      type: 'unknown[]',
      isRequired: true,
      description:
        'Array of input UI messages sent to the agent (typically user and assistant message objects).',
    },
    {
      name: 'abortSignal',
      type: 'AbortSignal',
      isRequired: false,
      description:
        'Optional abort signal to cancel streaming (e.g., when the client disconnects). Useful for enabling cancellation of long-running or streaming agent responses. Provide an instance of [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) (for example, from an `AbortController`).',
    },
    {
      name: '...options',
      type: 'UIMessageStreamResponseInit & UIMessageStreamOptions',
      isRequired: false,
      description:
        'Options for response headers, status, and additional streaming configuration.',
    },
  ]}
/>

## Returns

A `Promise<void>`. This function returns a promise that resolves when piping the UI message stream to the ServerResponse is complete.

## Example: Hono/Express Route Handler

```ts
import { pipeAgentUIStreamToResponse } from 'ai';
import { openaiWebSearchAgent } from './openai-web-search-agent';

app.post('/chat', async (req, res) => {
  const { messages } = await getJsonBody(req);

  // Optionally use abortSignal for cancellation on disconnect, etc.
  const abortController = new AbortController();
  // e.g., tie abortController to request lifecycle/disconnect detection as needed

  await pipeAgentUIStreamToResponse({
    response: res,
    agent: openaiWebSearchAgent,
    messages,
    abortSignal: abortController.signal, // optional
    // status: 200,
    // headers: { 'X-Custom': 'foo' },
    // ...additional streaming options
  });
});
```

## How It Works

1. **Streams Output:** The function creates a UI message stream from the agent and efficiently pipes it to the provided Node.js `ServerResponse`, setting appropriate HTTP headers (including content type and streaming-friendly headers) and status.
2. **Abort Support:** If you provide an `abortSignal`, you can cancel the streaming response (for example, when a client disconnects or a timeout occurs), improving resource usage and responsiveness.
3. **No Response Object:** Unlike serverless `Response`-returning APIs, this function does _not_ return a Response object. It writes streaming bytes directly to the Node.js response. This is more memory- and latency-efficient for Node.js server frameworks.

## Notes

- **abortSignal for Cancellation:** Use `abortSignal` to stop agent and stream processing early, improving robustness for long-running connections. In frameworks like Express or Hono, tie this to your server's disconnect or timeout events when possible.
- **Only for Node.js:** This function is intended for use in Node.js environments with access to `ServerResponse` objects, not for Edge/serverless/server-side frameworks using web `Response` objects.
- **Streaming Support:** Ensure your client and reverse proxy/server infrastructure support streaming HTTP responses.
- Supports both Hono (`@hono/node-server`), Express, and similar Node.js frameworks.

## See Also

- [`createAgentUIStreamResponse`](/docs/reference/ai-sdk-core/create-agent-ui-stream-response)
- [`Agent`](/docs/reference/ai-sdk-core/agent)
- [`UIMessageStreamOptions`](/docs/reference/ai-sdk-core/ui-message-stream-options)
- [`UIMessage`](/docs/reference/ai-sdk-core/ui-message)
