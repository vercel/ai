import ChatIdProvider from '@/components/chat-id-provider';
import GrokBuildHarnessChat from '@/components/grok-build-harness-chat';

export const metadata = {
  title: 'Grok Build — AI SDK Checkout',
};

const STORAGE_KEY = 'harness-grok-build-ai-sdk-coding-chat-id';

export default function HarnessGrokBuildAiSdkCodingPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <GrokBuildHarnessChat
        apiRoute="/api/harness/grok-build/ai-sdk-coding"
        exampleLabel="AI SDK Checkout"
      />
    </ChatIdProvider>
  );
}
