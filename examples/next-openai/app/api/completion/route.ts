import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  // Extract the `prompt` from the body of the request
  const { prompt } = await req.json();

  // Ask OpenAI for a streaming chat completion given the prompt
  const result = streamText({
    model: openai('gpt-4o'),
    prompt,
  });

  // Respond with the stream
  return result.toDataStreamResponse();
}
