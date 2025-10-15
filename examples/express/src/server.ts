import { openai } from '@ai-sdk/openai';
import {
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  streamText,
} from 'ai';
import 'dotenv/config';
import express, { Request, Response } from 'express';

const app = express();

const prompt = 'Invent a new holiday and describe its traditions.';

app.get('/', (_req: Request, res: Response) => {
  res.send(
    `<html><body>
      <form method="POST">
        <button type="submit">${prompt}</button>
      </form>
    </body></html>`,
  );
});

app.post('/', async (req: Request, res: Response) => {
  const result = streamText({
    model: openai('gpt-4o'),
    prompt,
  });

  result.pipeUIMessageStreamToResponse(res);
});

app.post('/custom-data-parts', async (req: Request, res: Response) => {
  pipeUIMessageStreamToResponse({
    response: res,
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
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

        writer.merge(result.toUIMessageStream({ sendStart: false }));
      },
    }),
  });
});

app.listen(8080, () => {
  console.log(`Example app listening on port ${8080}`);
});
