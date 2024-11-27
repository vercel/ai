import { openai } from '@ai-sdk/openai';
import { generateId, sendDataStreamResponse, streamText } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  // immediately start streaming (solves RAG issues with status, etc.)
  return sendDataStreamResponse({
    execute: dataStream => {
      dataStream.appendData('initialized call');

      const result = streamText({
        model: openai('gpt-4o'),
        messages,
        onChunk() {
          dataStream.appendMessageAnnotation({ chunk: '123' });
        },
        onFinish() {
          // message annotation:
          dataStream.appendMessageAnnotation({
            id: generateId(), // e.g. id from saved DB record
            other: 'information',
          });

          // call annotation:
          dataStream.appendData('call completed');
        },
      });

      // TODO: result.forwardToDataStream(dataStream);
      dataStream.forward(
        result.toDataStream().pipeThrough(new TextDecoderStream()),
      );
    },
  });
}
