'use client';

import { generateId } from 'ai';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ChatPage() {
  const router = useRouter();

  // redirect to a chat with a new, random id:
  useEffect(() => {
    router.replace(`/use-chat-persistence/${generateId()}`);
  }, [router]);
}
