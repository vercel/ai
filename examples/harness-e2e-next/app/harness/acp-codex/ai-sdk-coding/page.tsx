import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'ACP: Codex — AI SDK Checkout',
};

const STORAGE_KEY = 'harness-acp-codex-ai-sdk-coding-chat-id';

export default function CodexACPAiSdkCodingPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/acp-codex/ai-sdk-coding"
        exampleLabel="AI SDK Checkout"
        harnessLabel="ACP: Codex"
      />
    </ChatIdProvider>
  );
}
