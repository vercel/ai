import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'ACP: Grok Build — Basic',
};

const STORAGE_KEY = 'harness-acp-grok-build-basic-chat-id';

export default function GrokBuildACPBasicPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/acp-grok-build/basic"
        exampleLabel="Basic"
        harnessLabel="ACP: Grok Build"
      />
    </ChatIdProvider>
  );
}
