import { openai } from '@ai-sdk/openai';
import {
  generateId,
  createDataStreamResponse,
  streamText,
  createDataStream,
} from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const dataStream = createDataStream({
    execute: writer => {
      writer.write({ type: 'data', value: ['initialized call'] });

      const result = streamText({
        model: openai('gpt-4o'),
        messages,
        onChunk() {
          writer.write({
            type: 'message-annotations',
            value: [{ chunk: '123' }],
          });
        },
        onFinish() {
          // message annotation:
          writer.write({
            type: 'message-annotations',
            value: [
              {
                id: generateId(), // e.g. id from saved DB record
                other: 'information',
              },
            ],
          });

          // call annotation:
          writer.write({ type: 'data', value: ['call completed'] });
        },
      });

      writer.merge(result.toDataStream());
    },
    onError: error => {
      // Error messages are masked by default for security reasons.
      // If you want to expose the error message to the client, you can do so here:
      return error instanceof Error ? error.message : String(error);
    },
  });

  // immediately start streaming (solves RAG issues with status, etc.)
  return createDataStreamResponse({ dataStream });
}
