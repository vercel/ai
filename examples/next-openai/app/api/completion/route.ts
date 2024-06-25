import { openai } from '@ai-sdk/openai';
import { StreamData, StreamingTextResponse, streamText } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  // Extract the `prompt` from the body of the request
  const { prompt } = await req.json();

  const result = await streamText({
    model: openai('gpt-3.5-turbo-instruct'),
    maxTokens: 2000,
    prompt,
  });

  // optional: use stream data
  const data = new StreamData();

  data.append('call started');

  // Convert the response to an AI data stream
  const stream = result.toAIStream({
    onFinal(completion) {
      data.append('call completed');
      data.close();
    },
  });

  // Respond with the stream
  return new StreamingTextResponse(stream, {}, data);
}
