import { OpenAIStream, StreamingTextResponse, StreamData } from 'ai';
import OpenAI from 'openai';

export default defineLazyEventHandler(async () => {
  const apiKey = useRuntimeConfig().openaiApiKey;
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const openai = new OpenAI({
    apiKey: apiKey,
  });

  return defineEventHandler(async (event: any) => {
    // Extract the `prompt` from the body of the request
    const { prompt } = await readBody(event);

    // Ask OpenAI for a streaming chat completion given the prompt
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    });

    // optional: use stream data
    const data = new StreamData();

    data.append({ test: 'value' });

    // Convert the response into a friendly text-stream
    const stream = OpenAIStream(response, {
      onFinal(completion) {
        data.close();
      },
    });

    // Respond with the stream
    return new StreamingTextResponse(stream, {}, data);
  });
});
