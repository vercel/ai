import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

async function main() {
  console.log('=== Hono Streaming Example ===');

  const app = new Hono();

  // Basic UI Message Stream endpoint
  app.post('/chat', async c => {
    const result = streamText({
      model: openai('gpt-4o'),
      prompt: 'Invent a new holiday and describe its traditions.',
    });

    return result.toUIMessageStreamResponse();
  });

  // Text stream endpoint
  app.post('/text', async c => {
    const result = streamText({
      model: openai('gpt-4o'),
      prompt: 'Write a short poem about coding.',
    });

    c.header('Content-Type', 'text/plain; charset=utf-8');

    return new Response(result.textStream, {
      headers: c.res.headers,
    });
  });

  app.get('/health', c => c.text('Hono streaming server is running!'));

  const port = 3001;
  console.log(`Server starting on http://localhost:${port}`);
  console.log('Test with: curl -X POST http://localhost:3001/chat');

  serve({
    fetch: app.fetch,
    port,
  });
}

main().catch(console.error);
