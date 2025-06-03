import { MyUIMessage } from '@/util/chat-schema';
import { readChat, saveChat } from '@util/chat-store';
import { convertToModelMessages, streamText, UIMessage } from 'ai';

export async function POST(req: Request) {
  const { message, chatId }: { message: UIMessage; chatId: string } =
    await req.json();

  const chat = await readChat(chatId);
  const messages = [...chat.messages, message];

  const result = streamText({
    model: 'openai/gpt-4o-mini',
    messages: convertToModelMessages(messages),
  });

  result.consumeStream(); // always consume the stream even when the client disconnects

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    messageMetadata: ({ part }) => {
      if (part.type === 'start') {
        return { createdAt: Date.now() };
      }
    },
    onFinish: ({ messages }) => {
      // TODO fix type safety
      saveChat({ chatId, messages: messages as MyUIMessage[] });
    },
  });
}
