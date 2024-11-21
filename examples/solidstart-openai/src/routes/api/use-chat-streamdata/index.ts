import { openai } from '@ai-sdk/openai';
import { APIEvent } from '@solidjs/start/server';
import { generateId, StreamData, streamText } from 'ai';

export const POST = async (event: APIEvent) => {
  const { messages } = await event.request.json();

  // use stream data
  const data = new StreamData();
  data.append('initialized call');

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
    onChunk() {
      data.appendMessageAnnotation({ chunk: '123' });
    },
    onFinish() {
      // message annotation:
      data.appendMessageAnnotation({
        id: generateId(), // e.g. id from saved DB record
        other: 'information',
      });

      // call annotation:
      data.append('call completed');

      data.close();
    },
  });

  return result.toDataStreamResponse({ data });
};
