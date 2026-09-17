import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'Grok Build — Basic (with stop)',
};

const STORAGE_KEY = 'harness-grok-build-basic-with-stop-chat-id';

export default function GrokBuildBasicWithStopPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/grok-build/basic-with-stop"
        exampleLabel="Basic (with stop)"
        harnessLabel="Grok Build"
      />
    </ChatIdProvider>
  );
}
