import { OpenAI } from '@ai-sdk/openai';
import { StreamingTextResponse, streamText } from 'ai';
import type { RequestHandler } from './$types';

import { env } from '$env/dynamic/private';

// You may want to replace the above with a static private env variable
// for dead-code elimination and build-time type-checking:
// import { OPENAI_API_KEY } from '$env/static/private'

// Create an OpenAI Provider instance
const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY ?? '',
});

export const POST = (async ({ request }) => {
  // Extract the `prompt` from the body of the request
  const { messages } = await request.json();

  // Ask OpenAI for a streaming chat completion given the prompt
  const result = await streamText({
    model: openai.chat('gpt-4-turbo-preview'),
    messages,
  });

  // Respond with the stream
  return new StreamingTextResponse(result.toAIStream());
}) satisfies RequestHandler;
