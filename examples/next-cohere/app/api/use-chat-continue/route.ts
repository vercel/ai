import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Call the language model
  const result = streamText({
    model: openai('gpt-4o'),
    maxTokens: 256, // artificial limit for demo purposes
    maxSteps: 10,
    experimental_continueSteps: true,
    system: 'Stop when sufficient information was provided.',
    messages,
  });

  return result.toDataStreamResponse();
}
