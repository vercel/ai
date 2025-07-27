import { xai } from '@ai-sdk/xai';
import { convertToModelMessages, streamText, UIMessage } from 'ai';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const prompt = convertToModelMessages(messages);

  const result = streamText({
    model: xai('grok-beta'),
    prompt,
  });

  return result.toUIMessageStreamResponse();
}
