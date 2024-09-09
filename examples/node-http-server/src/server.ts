import { openai } from '@ai-sdk/openai';
import { StreamData, streamText } from 'ai';
import 'dotenv/config';
import { createServer } from 'http';

createServer(async (req, res) => {
  // use stream data (optional):
  const data = new StreamData();
  data.append('initialized call');

  const result = await streamText({
    model: openai('gpt-4-turbo'),
    prompt: 'What is the weather in San Francisco?',
    onFinish() {
      data.append('call completed');
      data.close();
    },
  });

  result.pipeDataStreamToResponse(res, { data });
}).listen(8080);
