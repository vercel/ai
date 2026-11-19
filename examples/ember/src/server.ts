import {
  convertToModelMessages,
  isStepCount,
  Output,
  pipeTextStreamToResponse,
  pipeUIMessageStreamToResponse,
  streamText,
  toTextStream,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';

const app = express();

/**
 * `strict: false` lets the analyze endpoint receive a plain JSON string.
 */
app.use(express.json({ strict: false }));

const model = 'openai/gpt-6-astra';

app.post('/api/chat', async (req: Request, res: Response) => {
  const { messages }: { messages: UIMessage[] } = req.body;

  const result = streamText({
    model,
    messages: await convertToModelMessages(messages),
    stopWhen: isStepCount(5),
    tools: {
      getWeatherInformation: {
        description: 'Get the weather in a given city.',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }: { city: string }) => {
          const conditions = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy'];
          const condition =
            conditions[Math.floor(Math.random() * conditions.length)];
          return `${city}: ${condition}`;
        },
      },
    },
  });

  pipeUIMessageStreamToResponse({
    response: res,
    stream: toUIMessageStream({
      stream: result.stream,
      onError: error =>
        error instanceof Error ? error.message : String(error),
    }),
  });
});

app.post('/api/completion', async (req: Request, res: Response) => {
  const { prompt } = req.body;

  const result = streamText({ model, prompt });

  pipeTextStreamToResponse({
    response: res,
    stream: toTextStream({ stream: result.stream }),
  });
});

app.post('/api/analyze', async (req: Request, res: Response) => {
  const input = req.body;
  const prompt =
    typeof input === 'string' ? input : JSON.stringify(input ?? null);

  const result = streamText({
    model,
    output: Output.object({
      schema: z.object({
        title: z.string(),
        summary: z.string(),
        tags: z.array(z.string()),
        sentiment: z.enum(['positive', 'negative', 'neutral']),
      }),
    }),
    prompt: `Analyze this content: ${prompt}`,
  });

  pipeTextStreamToResponse({
    response: res,
    stream: toTextStream({ stream: result.stream }),
  });
});

app.listen(3000, '127.0.0.1', () => {
  console.log('AI API listening on http://127.0.0.1:3000');
});
