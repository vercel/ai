import { openai } from '@ai-sdk/openai';
import { StreamingTextResponse, experimental_streamText } from 'ai';

export const runtime = 'edge';

export async function POST(req: Request) {
  // Extract the `messages` from the body of the request
  const { messages } = await req.json();

  // Call the language model
  const result = await experimental_streamText({
    model: openai.chat('gpt-4-turbo-preview'),
    messages,
  });

  // Respond with the stream
  return new StreamingTextResponse(result.toAIStream());
}
