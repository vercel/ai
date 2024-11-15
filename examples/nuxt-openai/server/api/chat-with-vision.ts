import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

export default defineLazyEventHandler(async () => {
  const apiKey = useRuntimeConfig().openaiApiKey;
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const openai = createOpenAI({ apiKey });

  return defineEventHandler(async (event: any) => {
    // Extract the `prompt` from the body of the request
    const { messages, data } = await readBody(event);

    const initialMessages = messages.slice(0, -1);
    const currentMessage = messages[messages.length - 1];

    // Ask OpenAI for a streaming chat completion given the prompt
    const response = streamText({
      model: openai('gpt-4o'),
      maxTokens: 150,
      messages: [
        ...initialMessages,
        {
          role: 'user',
          content: [
            { type: 'text', text: currentMessage.content },
            { type: 'image', image: new URL(data.imageUrl) },
          ],
        },
      ],
    });

    // Respond with the stream
    return response.toDataStreamResponse();
  });
});
