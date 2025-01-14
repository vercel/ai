import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { saveChat } from './chat-store';

export async function POST(req: Request) {
  const { messages, id } = await req.json();

  console.log('messages', messages);
  console.log('id', id);

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages,
    async onFinish({ response }) {
      // TODO merge response messages
      await saveChat({ id, messages });
    },
  });

  return result.toDataStreamResponse();
}
