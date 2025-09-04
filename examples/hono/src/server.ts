import { openai } from '@ai-sdk/openai';
import { serve } from '@hono/node-server';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from 'ai';
import 'dotenv/config';
import { Hono } from 'hono';

const app = new Hono();

app.post('/', async c => {
  console.log('POST /');
  const result = streamText({
    model: openai('gpt-4o'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });
  return result.toUIMessageStreamResponse();
});

app.post('/text', async c => {
  const result = streamText({
    model: openai('gpt-4o'),
    prompt: 'Write a short poem about coding.',
  });
  return result.toTextStreamResponse();
});

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
