import { createOpenAI } from '@ai-sdk/openai';
import {
  createDataStream,
  createDataStreamResponse,
  generateId,
  streamText,
} from 'ai';

export default defineLazyEventHandler(async () => {
  const openai = createOpenAI({
    apiKey: useRuntimeConfig().openaiApiKey,
  });

  return defineEventHandler(async (event: any) => {
    const { messages } = await readBody(event);

    // immediately start streaming (solves RAG issues with status, etc.)
    const dataStream = createDataStream({
      execute: writer => {
        writer.writeData('initialized call');

        const result = streamText({
          model: openai('gpt-4o'),
          messages,
          onChunk() {
            writer.writeMessageAnnotation({ chunk: '123' });
          },
          onFinish() {
            // message annotation:
            writer.writeMessageAnnotation({
              id: generateId(), // e.g. id from saved DB record
              other: 'information',
            });

            // call annotation:
            writer.writeData('call completed');
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

    return createDataStreamResponse({ dataStream });
  });
});
