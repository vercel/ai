import { StreamingTextResponse, StreamData, streamText } from 'ai';
import { APIEvent } from '@solidjs/start/server';
import { openai } from '@ai-sdk/openai';

export const POST = async (event: APIEvent) => {
  // Extract the `prompt` from the body of the request
  const { prompt } = await event.request.json();

  const result = await streamText({
    model: openai('gpt-3.5-turbo'),
    messages: [{ role: 'user', content: prompt }],
  });

  // optional: use stream data
  const data = new StreamData();

  data.append({ test: 'value' });

  // Respond with the stream
  return new StreamingTextResponse(result.toAIStream(), {}, data);
};
