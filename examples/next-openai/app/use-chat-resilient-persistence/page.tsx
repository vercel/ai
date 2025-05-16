import { redirect } from 'next/navigation';
import { createChat } from '@util/chat-store';

export default async function ChatPage() {
  const chatId = await createChat();
  redirect(`/use-chat-resilient-persistence/${chatId}`);
}
