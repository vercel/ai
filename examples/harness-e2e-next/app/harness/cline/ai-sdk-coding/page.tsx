import ChatIdProvider from '@/components/chat-id-provider';
import ClineHarnessChat from '@/components/cline-harness-chat';

export const metadata = {
  title: 'Cline — AI SDK Checkout',
};

const STORAGE_KEY = 'harness-cline-ai-sdk-coding-chat-id';

export default function HarnessClineAiSdkCodingPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ClineHarnessChat
        apiRoute="/api/harness/cline/ai-sdk-coding"
        exampleLabel="AI SDK Checkout"
      />
    </ChatIdProvider>
  );
}
