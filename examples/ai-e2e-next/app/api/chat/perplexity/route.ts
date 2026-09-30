import { perplexity } from '@ai-sdk/perplexity';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: perplexity('medium'),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
