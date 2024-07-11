import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

export async function POST(req: Request) {
  // Extract addition information ("something") from the body of the request:
  const { messages, something } = await req.json();

  console.log(something);

  // Call the language model
  const result = await streamText({
    model: openai('gpt-4-turbo'),
    messages,
  });

  // Respond with the stream
  return result.toAIStreamResponse();
}
