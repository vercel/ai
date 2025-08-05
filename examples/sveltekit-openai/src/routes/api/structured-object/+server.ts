import { streamObject } from 'ai';
import { notificationSchema } from '../../structured-object/schema.js';
import { createOpenAI } from '@ai-sdk/openai';
import { env } from '$env/dynamic/private';

const openai = createOpenAI({
  apiKey: env?.OPENAI_API_KEY,
});

export async function POST({ request }: { request: Request }) {
  const context = await request.json();

  const result = streamObject({
    model: openai('gpt-4o'),
    schema: notificationSchema,
    prompt:
      `Generate 3 notifications for a messages app in this context:` + context,
    onError: error => {
      console.error(error);
    },
  });

  return result.toTextStreamResponse();
}
