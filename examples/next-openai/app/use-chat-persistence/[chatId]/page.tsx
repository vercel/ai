import { loadChat } from '@/app/api/use-chat-persistence/chat-store';
import Chat from '../chat';

export default async function Page({
  params: { chatId },
}: {
  params: { chatId: string };
}) {
  return (
    <Chat
      chatId={chatId as string}
      initialMessages={await loadChat({ id: chatId })}
    />
  );
}
