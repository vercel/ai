import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'fx — Basic (with stop)',
};

const STORAGE_KEY = 'harness-fx-basic-with-stop-chat-id';

export default function FxBasicWithStopPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/fx/basic-with-stop"
        exampleLabel="Basic (with stop)"
        harnessLabel="fx"
      />
    </ChatIdProvider>
  );
}
