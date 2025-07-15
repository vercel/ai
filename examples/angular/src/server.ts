import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamObject, streamText } from 'ai';
import 'dotenv/config';
import express, { Request, Response } from 'express';
import z from 'zod';

const app = express();
app.use(express.json({ strict: false })); // Allow primitives (for analyze endpoint)

app.post('/api/chat', async (req: Request, res: Response) => {
  const { messages, selectedModel } = req.body;
  const result = streamText({
    model: openai(selectedModel),
    messages: convertToModelMessages(messages),
  });

  result.pipeUIMessageStreamToResponse(res);
});

app.post('/api/completion', async (req: Request, res: Response) => {
  const { prompt } = req.body;

  const result = streamText({
    model: openai('gpt-4o'),
    prompt,
  });

  result.pipeTextStreamToResponse(res);
});

app.post('/api/analyze', express.raw(), async (req: Request, res: Response) => {
  const input = req.body.toString('utf8');

  const result = streamObject({
    model: openai('gpt-4o'),
    schema: z.object({
      title: z.string(),
      summary: z.string(),
      tags: z.array(z.string()),
      sentiment: z.enum(['positive', 'negative', 'neutral']),
    }),
    prompt: `Analyze this content: ${input}`,
  });

  result.pipeTextStreamToResponse(res);
});

app.listen(3000, () => {
  console.log(`Example app listening on port ${3000}`);
});
