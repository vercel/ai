import { openai } from '@ai-sdk/openai';
import { APIEvent } from '@solidjs/start/server';
import { convertToCoreMessages, StreamData, streamText } from 'ai';

export const POST = async (event: APIEvent) => {
  const { messages } = await event.request.json();

  // use stream data
  const data = new StreamData();
  data.append('initialized call');

  const result = await streamText({
    model: openai('gpt-4o'),
    messages: convertToCoreMessages(messages),
    onFinish() {
      data.append('call completed');
      data.close();
    },
  });

  return result.toDataStreamResponse({ data });
};
