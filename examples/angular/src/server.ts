import { type OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai';
import { convertToModelMessages, Output, stepCountIs, streamText } from 'ai';
import 'dotenv/config';
import express, { Request, Response } from 'express';
import { z } from 'zod';

const app = express();
app.use(express.json({ strict: false })); // Allow primitives (for analyze endpoint)

const defaultModel = 'openai/gpt-5.2';

app.post('/api/chat', async (req: Request, res: Response) => {
  const { messages, selectedModel } = req.body;
  const modelId =
    typeof selectedModel === 'string' && selectedModel.length > 0
      ? selectedModel
      : defaultModel;
  const result = streamText({
    model: modelId,
    messages: await convertToModelMessages(messages ?? []),
    stopWhen: stepCountIs(5),
    providerOptions: {
      openai: {
        reasoningEffort: 'low',
        reasoningSummary: 'detailed',
      } satisfies OpenAILanguageModelResponsesOptions,
    },
    tools: {
      getWeatherInformation: {
        description: 'Get the weather in a given city.',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }: { city: string }) => {
          await new Promise(resolve => setTimeout(resolve, 500));
          const conditions = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy'];
          const condition =
            conditions[Math.floor(Math.random() * conditions.length)];
          return `${city}: ${condition}`;
        },
      },
    },
  });

  result.pipeUIMessageStreamToResponse(res, {
    sendReasoning: true,
    onError: error => (error instanceof Error ? error.message : String(error)),
  });
});

app.post('/api/completion', async (req: Request, res: Response) => {
  const { prompt } = req.body;

  const result = streamText({
    model: defaultModel,
    prompt,
  });

  result.pipeTextStreamToResponse(res);
});

app.post('/api/analyze', async (req: Request, res: Response) => {
  const input = req.body;
  const prompt =
    typeof input === 'string' ? input : JSON.stringify(input ?? null);

  const result = streamText({
    model: defaultModel,
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

  result.pipeTextStreamToResponse(res);
});

app.listen(3000, () => {
  console.log(`Example app listening on port ${3000}`);
});
