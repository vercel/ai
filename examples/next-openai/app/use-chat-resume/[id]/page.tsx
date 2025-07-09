import { loadChat } from '@/util/chat-store';
import { Chat } from '../chat';

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const messages = await loadChat(id);

<<<<<<< HEAD
  return <Chat chatId={id} autoResume={true} initialMessages={messages} />;
=======
  return <Chat id={id} autoResume={true} initialMessages={messages} />;
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
}
