import { createOpenAI } from '@ai-sdk/openai';
import { streamObject } from 'ai';
import { notificationSchema } from '~/shared/notification-schema';

export default defineLazyEventHandler(async () => {
  const apiKey = useRuntimeConfig().openaiApiKey;
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const openai = createOpenAI({ apiKey });

  return defineEventHandler(async (event: any) => {
    const context = await readBody(event);

    // Ask OpenAI for a streaming chat completion given the prompt
    const result = streamObject({
      model: openai('gpt-4.1'),
      prompt: `Generate 5 notifications for a messages app in this context: ${context}`,
      schema: notificationSchema,
    });

    // Respond with the stream
    return result.toTextStreamResponse();
  });
});
