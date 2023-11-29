import {
  OpenAIStream,
  StreamingTextResponse,
  experimental_StreamData,
} from 'ai';
import OpenAI from 'openai';

export default defineLazyEventHandler(async () => {
  const apiKey = useRuntimeConfig().openaiApiKey;
  if (!apiKey) throw new Error('Missing OpenAI API key');
  const openai = new OpenAI({
    apiKey: apiKey,
  });

  return defineEventHandler(async (event: any) => {
    // Extract the `prompt` from the body of the request
    const newVariable = await readBody(event);
    console.log('nw', newVariable);
    const { prompt } = newVariable as {
      prompt: string;
    };

    // Ask OpenAI for a streaming chat completion given the prompt
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    });

    // optional: use stream data
    const data = new experimental_StreamData();

    data.append({ test: 'value' });

    // Convert the response into a friendly text-stream
    const stream = OpenAIStream(response, {
      onFinal(completion) {
        data.close();
      },
      experimental_streamData: true,
    });

    // Respond with the stream
    return new StreamingTextResponse(stream, {}, data);
  });
});
