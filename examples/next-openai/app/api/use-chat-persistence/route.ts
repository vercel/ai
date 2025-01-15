import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { mergeMessages, saveChat } from './chat-store';

export async function POST(req: Request) {
  const { messages, id } = await req.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages,
    async onFinish({ response }) {
      await saveChat({
        id,
        messages: mergeMessages({
          requestMessages: messages,
          responseMessages: response.messages,
        }),
      });
    },
  });

  return result.toDataStreamResponse();
}
