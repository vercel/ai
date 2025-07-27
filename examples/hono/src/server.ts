import { openai } from '@ai-sdk/openai';
import { serve } from '@hono/node-server';
import { JsonToSseTransformStream, streamText } from 'ai';
import 'dotenv/config';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';

const app = new Hono();

app.post('/', async c => {
  const result = streamText({
    model: openai('gpt-4o'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  // Mark the response as a v1 data stream:
  c.header('X-Vercel-AI-Data-Stream', 'v1');
  c.header('Content-Type', 'text/plain; charset=utf-8');

  return stream(c, stream => stream.pipe(result.toUIMessageStream()));
});

app.post('/stream-data', async c => {
  // immediately start streaming the response
  const result = streamText({
    model: openai('gpt-4o'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  const dataStream = result.toUIMessageStream({
    onError: error => {
      // Error messages are masked by default for security reasons.
      // If you want to expose the error message to the client, you can do so here:
      return error instanceof Error ? error.message : String(error);
    },
  });

  // Mark the response as a v2 data stream:
  c.header('content-type', 'text/event-stream');
  c.header('cache-control', 'no-cache');
  c.header('connection', 'keep-alive');
  c.header('x-vercel-ai-data-stream', 'v2');
  c.header('x-accel-buffering', 'no'); // disable nginx buffering

  return stream(c, stream =>
    stream.pipe(
      dataStream
        .pipeThrough(new JsonToSseTransformStream())
        .pipeThrough(new TextEncoderStream()),
    ),
  );
});

serve({ fetch: app.fetch, port: 8080 });
