import { streamText } from 'ai';
import type { UIMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { Route } from './+types/api.chat';

export async function action({ request }: Route.ActionArgs) {
  const { messages }: { messages: UIMessage[] } = await request.json();

  const result = streamText({
    model: openai('o3-mini'),
    system: 'You are a helpful assistant.',
    messages,
  });

  return result.toDataStreamResponse();
}
