import { openai } from '@ai-sdk/openai';
import { APIEvent } from '@solidjs/start/server';
import { StreamData, streamText } from 'ai';

export const POST = async (event: APIEvent) => {
  const { messages } = await event.request.json();

  // use stream data
  const data = new StreamData();
  data.append('initialized call');

  data.appendMessageAnnotation({
    type: 'text',
    text: 'This is a test annotation',
  });
  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages,
    onFinish() {
      data.append('call completed');
      data.close();
    },
  });

  return result.toDataStreamResponse({ data });
};
