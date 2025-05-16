import { loadChat } from '@util/chat-store';
import Chat from './chat';

export default async function Page(props: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await props.params; // get the chat ID from the URL
  const messages = await loadChat(chatId); // load the chat messages
  return <Chat chatId={chatId} initialMessages={messages} />; // display the chat
}
