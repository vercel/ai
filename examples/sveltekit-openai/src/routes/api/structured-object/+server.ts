import { Output, createTextStreamResponse, streamText, toTextStream } from 'ai';
import { notificationSchema } from '../../structured-object/schema.js';
import { createOpenAI } from '@ai-sdk/openai';
import { OPENAI_API_KEY } from '$app/env/private';

const openai = createOpenAI({
  apiKey: OPENAI_API_KEY,
});

export async function POST({ request }: { request: Request }) {
  const context = await request.json();

  const result = streamText({
    model: openai('gpt-6-astra'),
    output: Output.object({ schema: notificationSchema }),
    prompt:
      `Generate 3 notifications for a messages app in this context:` + context,
    onError: error => {
      console.error(error);
    },
  });

  return createTextStreamResponse({
    stream: toTextStream({ stream: result.stream }),
  });
}
