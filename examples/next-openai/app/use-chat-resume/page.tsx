import { Chat } from './chat';
import { createIdGenerator } from 'ai';

const generateId = createIdGenerator({ size: 32 });

export default function Page() {
  const chatId = generateId();

  return <Chat chatId={chatId} autoResume={false} initialMessages={[]} />;
}
