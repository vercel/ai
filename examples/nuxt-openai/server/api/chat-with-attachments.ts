import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

export default defineLazyEventHandler(async () => {
  const apiKey = useRuntimeConfig().openaiApiKey;
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const openai = createOpenAI({ apiKey });

  return defineEventHandler(async (event: any) => {
    const { messages } = await readBody(event);

    // Ask OpenAI for a streaming chat completion given the prompt
    const response = streamText({
      model: openai('gpt-4o'),
      maxTokens: 150,
      messages,
    });

    // Respond with the stream
    return response.toDataStreamResponse();
  });
});
