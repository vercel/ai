import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'Grok Build — AI SDK Checkout',
};

const STORAGE_KEY = 'harness-grok-build-ai-sdk-coding-chat-id';

export default function GrokBuildAiSdkCodingPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/grok-build/ai-sdk-coding"
        exampleLabel="AI SDK Checkout"
        harnessLabel="Grok Build"
      />
    </ChatIdProvider>
  );
}
