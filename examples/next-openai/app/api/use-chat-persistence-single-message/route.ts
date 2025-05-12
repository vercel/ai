import { openai } from '@ai-sdk/openai';
import { loadChat, saveChat } from '@util/chat-store';
import { convertToModelMessages, streamText, UIMessage } from 'ai';

export async function POST(req: Request) {
  const { message, id }: { message: UIMessage; id: string } = await req.json();

  const previousMessages = await loadChat(id);
  const messages = [...previousMessages, message];

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages: convertToModelMessages(messages),
  });

  return result.toDataStreamResponse({
    originalMessages: messages,
    onFinish: ({ messages }) => {
      saveChat({ id, messages });
    },
  });
}
