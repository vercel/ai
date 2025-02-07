import { serve } from '@hono/node-server';
import { generateText, NoSuchModelError } from 'ai';
import 'dotenv/config';
import { Hono } from 'hono';
import { modelRegistry } from './model-registry';
import { CreateChatCompletionRequest } from './openai-request-schema';

const app = new Hono();

app.post('/v1/chat/completions', async c => {
  try {
    // Parse the request body as JSON
    const rawRequestBody = await c.req.json();

    // Validate the request body with the Zod schema
    const parseResult = CreateChatCompletionRequest.safeParse(rawRequestBody);
    if (!parseResult.success) {
      console.error('Validation errors:', parseResult.error.issues);
      return c.json(
        {
          error: {
            message: 'Invalid request schema',
            details: parseResult.error.issues,
          },
        },
        400,
      );
    }

    // If valid, extract the typed data
    const requestBody = parseResult.data;
    if (requestBody.stream) {
      // Return a JSON response with "hello world" and echo the validated body
      return c.json({
        message: 'hello world - streaming not supported',
        body: requestBody,
      });
    } else {
      const result = await generateText({
        model: modelRegistry.languageModel(requestBody.model),
        messages: requestBody.messages as any, // TODO mapping
      });

      return c.json({
        object: 'chat.completion',
        id: result.response.id,
        created: result.response.timestamp,
        model: result.response.modelId,
        // TODO system fingerprint
        // TODO service tier
        choices: [
          // TODO multiple choice support
          {
            index: 0,
            message: result.text,
            finish_reason: result.finishReason, // TODO mapping
          },
        ],
        usage: {
          prompt_tokens: result.usage.promptTokens,
          completion_tokens: result.usage.completionTokens,
          total_tokens: result.usage.totalTokens,
        },
      });
    }
  } catch (error) {
    if (NoSuchModelError.isInstance(error)) {
      return c.json({ error: { message: error.message } }, 400);
    }

    console.error('Error parsing request:', error);
    return c.json({ error: { message: 'Invalid JSON' } }, 400);
  }
});

serve({ fetch: app.fetch, port: 8080 });
