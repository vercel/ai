import { Chat } from './chat';
<<<<<<< HEAD
import { generateId } from 'ai';

export default function Page() {
  const chatId = generateId(32);

  return <Chat chatId={chatId} autoResume={false} initialMessages={[]} />;
=======
import { createIdGenerator } from 'ai';

const generateId = createIdGenerator({ size: 32 });

export default function Page() {
  const id = generateId();

  return <Chat id={id} autoResume={false} initialMessages={[]} />;
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
}
