import { redirect } from 'next/navigation';
import { generateId } from 'ai';

export default function ChatPage() {
  redirect(`/use-chat-persistence/${generateId()}`);
}
