import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'Grok Build — Basic',
};

const STORAGE_KEY = 'harness-grok-build-basic-chat-id';

export default function GrokBuildBasicPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/grok-build/basic"
        exampleLabel="Basic"
        harnessLabel="Grok Build"
      />
    </ChatIdProvider>
  );
}
