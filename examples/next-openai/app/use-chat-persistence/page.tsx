import { redirect } from 'next/navigation';
import { createChat } from '../api/use-chat-persistence/chat-store';

export default async function ChatPage() {
  const { id } = await createChat();
  redirect(`/use-chat-persistence/${id}`);
}
