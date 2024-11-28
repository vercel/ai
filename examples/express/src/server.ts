import { openai } from '@ai-sdk/openai';
import { pipeDataStreamToResponse, streamText } from 'ai';
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
  return pipeDataStreamToResponse(res, {
    execute: async dataStreamWriter => {
      // send stream data:
      dataStreamWriter.writeData('initialized call');

      const result = streamText({
        model: openai('gpt-4o'),
        prompt: 'Invent a new holiday and describe its traditions.',
      });

      result.mergeIntoDataStream(dataStreamWriter);
    },
  });
});

app.listen(8080, () => {
  console.log(`Example app listening on port ${8080}`);
});
