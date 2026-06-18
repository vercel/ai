import ChatIdProvider from '@/components/chat-id-provider';
import GrokBuildHarnessChat from '@/components/grok-build-harness-chat';

export const metadata = {
  title: 'Grok Build — Basic',
};

const STORAGE_KEY = 'harness-grok-build-basic-chat-id';

export default function HarnessGrokBuildPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <GrokBuildHarnessChat
        apiRoute="/api/harness/grok-build/basic"
        exampleLabel="Basic"
      />
    </ChatIdProvider>
  );
}
