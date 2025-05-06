import { openai } from '@ai-sdk/openai';
import { createDataStream, pipeDataStreamToResponse, streamText } from 'ai';
import 'dotenv/config';
import express, { Request, Response } from 'express';

const app = express();

app.post('/', async (req: Request, res: Response) => {
  const result = streamText({
    model: openai('gpt-4o'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  result.pipeDataStreamToResponse(res);
});

app.post('/stream-data', async (req: Request, res: Response) => {
  // immediately start streaming the response

  const dataStream = createDataStream({
    execute: async writer => {
      writer.write({ type: 'data', value: ['initialized call'] });

      const result = streamText({
        model: openai('gpt-4o'),
        prompt: 'Invent a new holiday and describe its traditions.',
      });

      writer.merge(result.toDataStream());
    },
    onError: error => {
      // Error messages are masked by default for security reasons.
      // If you want to expose the error message to the client, you can do so here:
      return error instanceof Error ? error.message : String(error);
    },
  });

  pipeDataStreamToResponse({ response: res, dataStream });
});

app.listen(8080, () => {
  console.log(`Example app listening on port ${8080}`);
});
