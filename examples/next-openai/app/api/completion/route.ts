import { openai } from '@ai-sdk/openai';
import { StreamData, StreamingTextResponse, experimental_streamText } from 'ai';

export const runtime = 'edge';

export async function POST(req: Request) {
  // Extract the `prompt` from the body of the request
  const { prompt } = await req.json();

  const result = await experimental_streamText({
    model: openai.completion('gpt-3.5-turbo-instruct'),
    maxTokens: 2000,
    prompt,
  });

  // optional: use stream data
  const data = new StreamData();

  data.append({ test: 'value' });

  // Convert the response into a friendly text-stream
  const stream = result.toAIStream({
    onFinal(completion) {
      data.close();
    },
  });

  // Respond with the stream
  return new StreamingTextResponse(stream, {}, data);
}
