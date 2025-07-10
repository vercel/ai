import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText } from 'ai';
import 'dotenv/config';
import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

app.post('/api/chat', async (req: Request, res: Response) => {
  const { messages, selectedModel } = req.body;
  const result = streamText({
    model: openai(selectedModel),
    messages: convertToModelMessages(messages),
  });

  result.pipeUIMessageStreamToResponse(res);
});

app.listen(3000, () => {
  console.log(`Example app listening on port ${3000}`);
});
