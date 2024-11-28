import { createOpenAI } from '@ai-sdk/openai';
import { createDataStreamResponse, generateId, streamText } from 'ai';

import { env } from '$env/dynamic/private';
// You may want to replace the above with a static private env variable
// for dead-code elimination and build-time type-checking:
// import { OPENAI_API_KEY } from '$env/static/private'

import type { RequestHandler } from './$types';

// Create an OpenAI Provider instance
const openai = createOpenAI({
  apiKey: env.OPENAI_API_KEY ?? '',
});

export const POST = (async ({ request }) => {
  const { messages } = await request.json();

  // immediately start streaming (solves RAG issues with status, etc.)
  return createDataStreamResponse({
    execute: dataStream => {
      dataStream.writeData('initialized call');

      const result = streamText({
        model: openai('gpt-4o'),
        messages,
        onChunk() {
          dataStream.writeMessageAnnotation({ chunk: '123' });
        },
        onFinish() {
          // message annotation:
          dataStream.writeMessageAnnotation({
            id: generateId(), // e.g. id from saved DB record
            other: 'information',
          });

          // call annotation:
          dataStream.writeData('call completed');
        },
      });

      result.mergeIntoDataStream(dataStream);
    },
    onError: error => {
      // Error messages are masked by default for security reasons.
      // If you want to expose the error message to the client, you can do so here:
      return error instanceof Error ? error.message : String(error);
    },
  });
}) satisfies RequestHandler;
