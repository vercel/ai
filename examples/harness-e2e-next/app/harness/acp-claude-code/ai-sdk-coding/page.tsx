import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'ACP: Claude Code — AI SDK Checkout',
};

const STORAGE_KEY = 'harness-acp-claude-code-ai-sdk-coding-chat-id';

export default function ClaudeCodeACPAiSdkCodingPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/acp-claude-code/ai-sdk-coding"
        exampleLabel="AI SDK Checkout"
        harnessLabel="ACP: Claude Code"
      />
    </ChatIdProvider>
  );
}
