import { loadChat } from '@/app/api/use-chat-persistence/chat-store';
import Chat from '../chat';

export default async function Page({
  params,
}: {
  params: {
    chatId: string;
  };
}) {
  const { chatId } = params;
  return (
    <Chat chatId={chatId} initialMessages={await loadChat({ id: chatId })} />
  );
}
