import { serve } from '@hono/node-server';
import 'dotenv/config';
import { Hono } from 'hono';
import { CreateChatCompletionRequest } from './openai-request-schema';

const app = new Hono();

app.post('/v1/chat/completions', async c => {
  try {
    // Parse the request body as JSON
    const requestBody = await c.req.json();

    // Validate the request body with the Zod schema
    const parseResult = CreateChatCompletionRequest.safeParse(requestBody);
    if (!parseResult.success) {
      console.error('Validation errors:', parseResult.error.issues);
      return c.json(
        { error: 'Invalid request schema', details: parseResult.error.issues },
        400,
      );
    }
    // If valid, extract the typed data
    const validatedBody = parseResult.data;
    console.log('Validated request body:', validatedBody);

    // Return a JSON response with "hello world" and echo the validated body
    return c.json({ message: 'hello world', body: validatedBody });
  } catch (error) {
    console.error('Error parsing request:', error);
    return c.text('Invalid JSON', 400);
  }
});

serve({ fetch: app.fetch, port: 8080 });
