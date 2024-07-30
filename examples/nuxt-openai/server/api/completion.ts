import { createOpenAI } from '@ai-sdk/openai';
import { StreamData, streamText } from 'ai';

export default defineLazyEventHandler(async () => {
  const apiKey = useRuntimeConfig().openaiApiKey;
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const openai = createOpenAI({
    apiKey: apiKey,
  });

  return defineEventHandler(async (event: any) => {
    // Extract the `prompt` from the body of the request
    const { prompt } = await readBody(event);

    // optional: use stream data
    const data = new StreamData();

    data.append({ test: 'value' });

    // Ask OpenAI for a streaming chat completion given the prompt
    const result = await streamText({
      model: openai('gpt-3.5-turbo'),
      messages: [{ role: 'user', content: prompt }],
      onFinish() {
        data.append('call completed');
        data.close();
      },
    });

    // Respond with the stream
    return result.toDataStreamResponse({ data });
  });
});
