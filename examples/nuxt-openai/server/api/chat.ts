import { createOpenAI } from '@ai-sdk/openai';
import { convertToModelMessages, streamText } from 'ai';

export default defineLazyEventHandler(async () => {
  const openai = createOpenAI({
    apiKey: useRuntimeConfig().openaiApiKey,
  });

  return defineEventHandler(async (event: any) => {
    // Extract the `messages` from the body of the request
    const { messages } = await readBody(event);

    console.log('messages', messages);

    // Call the language model
    const result = streamText({
      model: openai('gpt-4-turbo'),
      messages: convertToModelMessages(messages),
      async onFinish({ text, toolCalls, toolResults, usage, finishReason }) {
        // implement your own logic here, e.g. for storing messages
        // or recording token usage
      },
    });

    // Respond with the stream
    return result.toUIMessageStreamResponse();
  });
});
