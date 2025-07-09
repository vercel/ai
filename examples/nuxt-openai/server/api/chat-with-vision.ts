import { createOpenAI } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';

export default defineLazyEventHandler(async () => {
  const apiKey = useRuntimeConfig().openaiApiKey;
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const openai = createOpenAI({ apiKey });

  return defineEventHandler(async (event: any) => {
    // Extract the `prompt` from the body of the request
    const { messages, data } = await readBody(event);

    const initialMessages = convertToModelMessages(messages.slice(0, -1));
    const currentMessage = messages[messages.length - 1] as UIMessage;

    // Ask OpenAI for a streaming chat completion given the prompt
    const response = streamText({
      model: openai('gpt-4o'),
      maxOutputTokens: 150,
      messages: [
        ...initialMessages,
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: currentMessage.parts
                .map(part => (part.type === 'text' ? part.text : ''))
                .join(''),
            },
            { type: 'image', image: new URL(data.imageUrl) },
          ],
        },
      ],
    });

    // Respond with the stream
    return response.toUIMessageStreamResponse();
  });
});
