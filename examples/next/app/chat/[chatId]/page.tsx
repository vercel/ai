import { readChat } from '@util/chat-store';
import Chat from './chat';

export default async function Page(props: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await props.params; // get the chat ID from the URL
  const chat = await readChat(chatId); // load the chat
  return <Chat chat={chat} />; // display the chat
}
