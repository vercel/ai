---
title: Hono
description: Example of using the AI SDK in a Hono server.
tags: ['api servers', 'streaming']
---

# Hono

You can use the AI SDK in a [Hono](https://hono.dev/) server to generate and stream text and objects to the client.

## Examples

The examples start a simple HTTP server that listens on port 8080. You can e.g. test it using `curl`:

```bash
curl -X POST http://localhost:8080
```

<Note>
  The examples use the OpenAI `gpt-4o` model. Ensure that the OpenAI API key is
  set in the `OPENAI_API_KEY` environment variable.
</Note>

**Full example**: [github.com/vercel/ai/examples/hono](https://github.com/vercel/ai/tree/main/examples/hono)

### UI Message Stream

You can use the `toUIMessageStreamResponse` method to create a properly formatted streaming response.

```ts filename='index.ts'
import { openai } from '@ai-sdk/openai';
import { serve } from '@hono/node-server';
import { streamText } from 'ai';
import { Hono } from 'hono';

const app = new Hono();

app.post('/', async c => {
  const result = streamText({
    model: openai('gpt-4o'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });
  return result.toUIMessageStreamResponse();
});

serve({ fetch: app.fetch, port: 8080 });
```

### Text Stream

You can use the `toTextStreamResponse` method to return a text stream response.

```ts filename='index.ts'
import { openai } from '@ai-sdk/openai';
import { serve } from '@hono/node-server';
import { streamText } from 'ai';
import { Hono } from 'hono';

const app = new Hono();

app.post('/text', async c => {
  const result = streamText({
    model: openai('gpt-4o'),
    prompt: 'Write a short poem about coding.',
  });
  return result.toTextStreamResponse();
});

serve({ fetch: app.fetch, port: 8080 });
```

### Sending Custom Data

You can use `createUIMessageStream` and `createUIMessageStreamResponse` to send custom data to the client.

```ts filename='index.ts'
import { openai } from '@ai-sdk/openai';
import { serve } from '@hono/node-server';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from 'ai';
import { Hono } from 'hono';

const app = new Hono();

app.post('/stream-data', async c => {
  // immediately start streaming the response
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: 'start' });

      writer.write({
        type: 'data-custom',
        data: {
          custom: 'Hello, world!',
        },
      });

      const result = streamText({
        model: openai('gpt-4o'),
        prompt: 'Invent a new holiday and describe its traditions.',
      });

      writer.merge(
        result.toUIMessageStream({
          sendStart: false,
          onError: error => {
            // Error messages are masked by default for security reasons.
            // If you want to expose the error message to the client, you can do so here:
            return error instanceof Error ? error.message : String(error);
          },
        }),
      );
    },
  });
  return createUIMessageStreamResponse({ stream });
});

serve({ fetch: app.fetch, port: 8080 });
```

## Troubleshooting

- Streaming not working when [proxied](/docs/troubleshooting/streaming-not-working-when-proxied)
