import ChatIdProvider from '@/components/chat-id-provider';
import ClaudeCodeHarnessChat from '@/components/claude-code-harness-chat';

export const metadata = {
  title: 'Claude Code — Detach',
};

const STORAGE_KEY = 'harness-claude-code-detach-chat-id';

export default function HarnessClaudeCodeDetachPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ClaudeCodeHarnessChat
        apiRoute="/api/harness/claude-code/detach"
        exampleLabel="Detach"
      />
    </ChatIdProvider>
  );
}
