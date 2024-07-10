import { CoreMessage, Message, convertToCoreMessages, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages }: { messages: any[] } = await req.json();

  const result = await streamText({
    model: openai('gpt-4o'),
    system: 'You are a helpful assistant.',
    messages: messages.map(({ role, parts }) => ({ role, content: parts })),
  });

  return result.toAIStreamResponse();
}
