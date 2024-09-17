import { openai } from '@ai-sdk/openai';
import { StreamData, streamText } from 'ai';
import 'dotenv/config';
import express, { Request, Response } from 'express';

const app = express();

app.post('/', async (req: Request, res: Response) => {
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

  result.pipeDataStreamToResponse(res, { data });
});

app.listen(8080, () => {
  console.log(`Example app listening on port ${8080}`);
});
