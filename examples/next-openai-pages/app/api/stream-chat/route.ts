import { Message, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages }: { messages: Message[] } = await req.json();

  const result = await streamText({
    model: openai('gpt-4o'),
    system: 'You are a helpful assistant.',
    // @ts-expect-error TODO: add function to prepare messages for streamText
    messages: messages.map(({ role, parts }) => ({ role, content: parts })),
  });

  return result.toAIStreamResponse();
}
