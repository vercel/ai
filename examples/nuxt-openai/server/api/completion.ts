import { streamText, StreamingTextResponse, StreamData } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export default defineLazyEventHandler(async () => {
  const apiKey = useRuntimeConfig().openaiApiKey;
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const openai = createOpenAI({
    apiKey: apiKey,
  });

  return defineEventHandler(async (event: any) => {
    // Extract the `prompt` from the body of the request
    const { prompt } = await readBody(event);

    // Ask OpenAI for a streaming chat completion given the prompt
    const result = await streamText({
      model: openai('gpt-3.5-turbo'),
      messages: [{ role: 'user', content: prompt }],
    });

    // optional: use stream data
    const data = new StreamData();

    data.append({ test: 'value' });

    // Convert the response into a friendly text-stream
    const stream = result.toAIStream({
      onFinal(_) {
        data.close();
      },
    });

    // Respond with the stream
    return new StreamingTextResponse(stream, {}, data);
  });
});
