import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'ACP: Claude Code — Basic (with stop)',
};

const STORAGE_KEY = 'harness-acp-claude-code-basic-with-stop-chat-id';

export default function ClaudeCodeACPBasicWithStopPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/acp-claude-code/basic-with-stop"
        exampleLabel="Basic (with stop)"
        harnessLabel="ACP: Claude Code"
      />
    </ChatIdProvider>
  );
}
