import { createOpenAI } from '@ai-sdk/openai';
import { generateId, StreamData, streamText } from 'ai';

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
}) satisfies RequestHandler;
