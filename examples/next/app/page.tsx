'use client';

import { useActiveChat } from './chat-context';
import Chat from './chat/[chatId]/chat';

export default function ChatPage() {
  const { chat } = useActiveChat();
  return (
    <Chat
      chatData={{ id: chat?.id!, messages: chat?.messages! }}
      isNewChat
      resume={false}
    />
  );
}
