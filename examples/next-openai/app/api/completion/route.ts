import { StreamingTextResponse, experimental_StreamData } from 'ai';
import { streamText } from 'ai/core';
import { openai } from 'ai/openai';

export const runtime = 'edge';

export async function POST(req: Request) {
  // Extract the `prompt` from the body of the request
  const { prompt } = await req.json();

  const result = await streamText({
    model: openai.completion('gpt-3.5-turbo-instruct'),
    maxTokens: 2000,
    prompt,
  });

  // optional: use stream data
  const data = new experimental_StreamData();

  data.append({ test: 'value' });

  // Convert the response into a friendly text-stream
  const stream = result.toAIStream({
    onFinal(completion) {
      data.close();
    },
    experimental_streamData: true,
  });

  // Respond with the stream
  return new StreamingTextResponse(stream, {}, data);
}
