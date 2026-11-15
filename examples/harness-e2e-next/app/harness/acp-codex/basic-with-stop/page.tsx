import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'ACP: Codex — Basic (with stop)',
};

const STORAGE_KEY = 'harness-acp-codex-basic-with-stop-chat-id';

export default function CodexACPBasicWithStopPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/acp-codex/basic-with-stop"
        exampleLabel="Basic (with stop)"
        harnessLabel="ACP: Codex"
      />
    </ChatIdProvider>
  );
}
