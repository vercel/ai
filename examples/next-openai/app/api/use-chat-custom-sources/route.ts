import { openai } from '@ai-sdk/openai';
import { createDataStream, createDataStreamResponse, streamText } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const dataStream = createDataStream({
    execute: writer => {
      // write a custom url source to the stream:
      writer.write({
        type: 'source',
        value: {
          type: 'source',
          sourceType: 'url',
          id: 'source-1',
          url: 'https://example.com',
          title: 'Example Source',
        },
      });

      const result = streamText({
        model: openai('gpt-4o'),
        messages,
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createDataStreamResponse({ dataStream });
}
