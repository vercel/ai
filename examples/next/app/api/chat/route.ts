import { loadChat, saveChat } from '@util/chat-store';
import { convertToModelMessages, streamText, UIMessage } from 'ai';

export async function POST(req: Request) {
  const { message, chatId }: { message: UIMessage; chatId: string } =
    await req.json();

  const chat = await loadChat(chatId);
  const messages = [...chat.messages, message];

  const result = streamText({
    model: 'openai/gpt-4o-mini',
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: ({ messages }) => {
      saveChat({ chatId, messages });
    },
  });
}
