import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { messages, id } = await req.json();

  console.log('messages', messages);
  console.log('id', id);

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
    async onFinish({ text, toolCalls, toolResults, usage, finishReason }) {},
  });

  return result.toDataStreamResponse();
}
