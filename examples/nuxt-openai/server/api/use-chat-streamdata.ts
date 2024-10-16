import { createOpenAI } from '@ai-sdk/openai';
import { convertToCoreMessages, StreamData, streamText } from 'ai';

export default defineLazyEventHandler(async () => {
  const openai = createOpenAI({
    apiKey: useRuntimeConfig().openaiApiKey,
  });

  return defineEventHandler(async (event: any) => {
    const { messages } = await readBody(event);

    // use stream data
    const data = new StreamData();
    data.append('initialized call');

    const result = await streamText({
      model: openai('gpt-4o'),
      messages: convertToCoreMessages(messages),
      onFinish() {
        data.append('call completed');
        data.close();
      },
    });

    return result.toDataStreamResponse({ data });
  });
});
