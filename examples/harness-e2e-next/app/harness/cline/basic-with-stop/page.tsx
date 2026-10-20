import ChatIdProvider from '@/components/chat-id-provider';
import ClineHarnessChat from '@/components/cline-harness-chat';

export const metadata = {
  title: 'Cline — Basic (with stop)',
};

const STORAGE_KEY = 'harness-cline-basic-with-stop-chat-id';

export default function HarnessClineBasicWithStopPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ClineHarnessChat
        apiRoute="/api/harness/cline/basic-with-stop"
        exampleLabel="Basic (with stop)"
      />
    </ChatIdProvider>
  );
}
