import { mistral } from '@ai-sdk/mistral';
import { convertToModelMessages, streamText, UIMessage } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const prompt = convertToModelMessages(messages);

  const result = streamText({
    model: mistral('mistral-small-latest'),
    prompt,
  });

  return result.toUIMessageStreamResponse();
}
