'use client';

import CodexHarnessChat from '@/components/codex-harness-chat';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'harness-codex-ai-sdk-coding-chat-id';

export default function HarnessCodexAiSdkCodingPage() {
  const [chatId, setChatId] = useState<string | null>(null);

  useEffect(() => {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) {
      setChatId(existing);
      return;
    }
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    setChatId(fresh);
  }, []);

  if (!chatId) {
    return null;
  }

  return (
    <CodexHarnessChat
      chatId={chatId}
      apiRoute="/api/harness/codex/ai-sdk-coding"
      exampleLabel="AI SDK Checkout"
      onReset={() => {
        window.localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
      }}
    />
  );
}
