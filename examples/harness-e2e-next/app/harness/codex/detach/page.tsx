import ChatIdProvider from '@/components/chat-id-provider';
import CodexHarnessChat from '@/components/codex-harness-chat';

export const metadata = {
  title: 'Codex — Detach',
};

const STORAGE_KEY = 'harness-codex-detach-chat-id';

export default function HarnessCodexDetachPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <CodexHarnessChat
        apiRoute="/api/harness/codex/detach"
        exampleLabel="Detach"
      />
    </ChatIdProvider>
  );
}
