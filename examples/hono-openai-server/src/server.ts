import { serve } from '@hono/node-server';
import 'dotenv/config';
import { Hono } from 'hono';

const app = new Hono();

app.post('/v1/chat/completions', async c => {
  try {
    // Parse the request body as JSON
    const requestBody = await c.req.json();
    console.log('Parsed request body:', requestBody);

    // Return a JSON response with "hello world" and echo the parsed body
    return c.json({ message: 'hello world', body: requestBody });
  } catch (error) {
    console.error('Error parsing request body:', error);
    return c.text('Invalid JSON', 400);
  }
});

serve({ fetch: app.fetch, port: 8080 });
