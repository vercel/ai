import { createOpenAI } from '@ai-sdk/openai';
import { StreamData, streamText } from 'ai';

export default defineLazyEventHandler(async () => {
  const openai = createOpenAI({
    apiKey: useRuntimeConfig().openaiApiKey,
  });

  return defineEventHandler(async (event: any) => {
    const { messages } = await readBody(event);

    // use stream data
    const data = new StreamData();
    data.append('initialized call');

    const result = streamText({
      model: openai('gpt-4o'),
      messages,
      onFinish() {
        data.append('call completed');
        data.close();
      },
    });

    return result.toDataStreamResponse({ data });
  });
});
