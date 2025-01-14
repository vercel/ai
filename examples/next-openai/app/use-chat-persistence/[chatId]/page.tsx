import { loadChat } from '@/app/api/use-chat-persistence/chat-store';
import Chat from '../chat';

export default async function Page(props: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await props.params;
  return (
    <Chat chatId={chatId} initialMessages={await loadChat({ id: chatId })} />
  );
}
