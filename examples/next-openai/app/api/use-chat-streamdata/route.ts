import { openai } from '@ai-sdk/openai';
import { generateId, StreamData, streamText } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  // use stream data
  const data = new StreamData();
  data.append('initialized call');

  const result = await streamText({
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
}
