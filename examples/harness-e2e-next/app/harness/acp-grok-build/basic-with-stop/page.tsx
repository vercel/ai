import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'ACP: Grok Build — Basic (with stop)',
};

const STORAGE_KEY = 'harness-acp-grok-build-basic-with-stop-chat-id';

export default function GrokBuildACPBasicWithStopPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/acp-grok-build/basic-with-stop"
        exampleLabel="Basic (with stop)"
        harnessLabel="ACP: Grok Build"
      />
    </ChatIdProvider>
  );
}
