import { createOpenAI } from '@ai-sdk/openai';
import { generateId, StreamData, streamText } from 'ai';

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
      onChunk() {
        data.appendMessageAnnotation({ chunk: '123' });
      },
      onFinish() {
        // message annotation:
        data.appendMessageAnnotation({
          id: generateId(), // e.g. id from saved DB record
          other: 'information',
        });

        // call annotation:
        data.append('call completed');

        data.close();
      },
    });

    return result.toDataStreamResponse({ data });
  });
});
