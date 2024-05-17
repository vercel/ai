import { openai } from '@ai-sdk/openai';
import { StreamData, streamText, streamToResponse } from 'ai';
import { createServer } from 'http';
import dotenv from 'dotenv';

dotenv.config();

createServer(async (req, res) => {
  const result = await streamText({
    model: openai('gpt-4-turbo'),
    prompt: 'What is the weather in San Francisco?',
  });

  // use stream data
  const data = new StreamData();

  data.append('initialized call');

  streamToResponse(
    result.toAIStream({
      onFinal() {
        data.append('call completed');
        data.close();
      },
    }),
    res,
    {},
    data,
  );
}).listen(8080);
