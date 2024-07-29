import { openai } from '@ai-sdk/openai';
import { APIEvent } from '@solidjs/start/server';
import { StreamData, streamText } from 'ai';

export const POST = async (event: APIEvent) => {
  // Extract the `prompt` from the body of the request
  const { prompt } = await event.request.json();

  // optional: use stream data
  const data = new StreamData();
  data.append({ test: 'value' });

  const result = await streamText({
    model: openai('gpt-3.5-turbo'),
    messages: [{ role: 'user', content: prompt }],
    onFinish() {
      data.append('call completed');
      data.close();
    },
  });

  // Respond with the stream
  return result.toDataStreamResponse({ data });
};
