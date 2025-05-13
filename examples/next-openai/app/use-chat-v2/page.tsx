'use client';

import { generateId } from 'ai';
import { Chat } from './chat';

export default function ChatPage() {
  const id = generateId();
  return <Chat key={id} id={id} />;
}
