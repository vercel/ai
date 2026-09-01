import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'ACP: Codex — Basic',
};

const STORAGE_KEY = 'harness-acp-codex-basic-chat-id';

export default function CodexACPBasicPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/acp-codex/basic"
        exampleLabel="Basic"
        harnessLabel="ACP: Codex"
      />
    </ChatIdProvider>
  );
}
