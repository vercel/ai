import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'ACP: Claude Code — Basic',
};

const STORAGE_KEY = 'harness-acp-claude-code-basic-chat-id';

export default function ClaudeCodeACPBasicPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/acp-claude-code/basic"
        exampleLabel="Basic"
        harnessLabel="ACP: Claude Code"
      />
    </ChatIdProvider>
  );
}
