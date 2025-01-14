'use client';

import { useParams } from 'next/navigation';
import Chat from '../chat';

export default function Page() {
  const { chatId } = useParams();
  return <Chat chatId={chatId as string} />;
}
