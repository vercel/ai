import ChatIdProvider from '@/components/chat-id-provider';
import GrokBuildHarnessChat from '@/components/grok-build-harness-chat';

export const metadata = {
  title: 'Grok Build — Basic (with stop)',
};

const STORAGE_KEY = 'harness-grok-build-basic-with-stop-chat-id';

export default function HarnessGrokBuildBasicWithStopPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <GrokBuildHarnessChat
        apiRoute="/api/harness/grok-build/basic-with-stop"
        exampleLabel="Basic (with stop)"
      />
    </ChatIdProvider>
  );
}
