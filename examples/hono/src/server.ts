import { openai } from '@ai-sdk/openai';
import { serve } from '@hono/node-server';
import { StreamData, streamText } from 'ai';
import 'dotenv/config';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';

const app = new Hono();

app.post('/', async c =>
  stream(c, async stream => {
    // use stream data (optional):
    const data = new StreamData();
    data.append('initialized call');

    const result = await streamText({
      model: openai('gpt-4o'),
      prompt: 'Invent a new holiday and describe its traditions.',
      onFinish() {
        data.append('call completed');
        data.close();
      },
    });

    // Mark the response as a v1 data stream:
    c.header('X-Vercel-AI-Data-Stream', 'v1');
    c.header('Content-Type', 'text/plain; charset=utf-8');

    await stream.pipe(result.toDataStream({ data }));
  }),
);

serve({ fetch: app.fetch, port: 8080 });
