import { Chat } from './chat';
import { generateId } from 'ai';

export default function Page() {
  const chatId = generateId(32);

  return <Chat chatId={chatId} autoResume={false} initialMessages={[]} />;
}
