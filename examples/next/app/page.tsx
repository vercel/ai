import { generateId } from 'ai';
import Chat from './chat/[chatId]/chat';

export default async function ChatPage() {
  const chatData = {
    id: generateId(),
    messages: [],
  };

  return <Chat chatData={chatData} />;
}
