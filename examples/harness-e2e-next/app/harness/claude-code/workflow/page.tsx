'use client';

import ClaudeCodeHarnessChat from '@/components/claude-code-harness-chat';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'harness-claude-code-workflow-chat-id';

export default function HarnessClaudeCodeWorkflowPage() {
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
    <ClaudeCodeHarnessChat
      chatId={chatId}
      apiRoute="/api/harness/claude-code/workflow"
      exampleLabel="Workflow"
      onReset={() => {
        window.localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
      }}
    />
  );
}
