import { loadChat } from '@/util/chat-store';
import { Chat } from '../chat';

export default async function Page({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;

  const messages = await loadChat(chatId);

  return <Chat chatId={chatId} autoResume={true} initialMessages={messages} />;
}
