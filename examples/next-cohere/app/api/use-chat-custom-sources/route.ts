import { openai } from '@ai-sdk/openai';
import { createDataStreamResponse, streamText } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  return createDataStreamResponse({
    execute: dataStream => {
      // write a custom url source to the stream:
      dataStream.writeSource({
        sourceType: 'url',
        id: 'source-1',
        url: 'https://example.com',
        title: 'Example Source',
      });

      const result = streamText({
        model: openai('gpt-4o'),
        messages,
      });

      result.mergeIntoDataStream(dataStream);
    },
  });
}
