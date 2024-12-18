import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

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
  // Extract the `prompt` from the body of the request
  const { prompt } = await request.json();

  // Ask OpenAI for a streaming chat completion given the prompt
  const result = streamText({
    model: openai('gpt-4o'),
    prompt,
  });

  // Respond with the stream
  return result.toDataStreamResponse();
}) satisfies RequestHandler;
