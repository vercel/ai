import ChatIdProvider from '@/components/chat-id-provider';
import EveHarnessChat from '@/components/eve-harness-chat';

export const metadata = {
  title: 'Eve — Basic',
};

const STORAGE_KEY = 'harness-eve-basic-chat-id';

export default function HarnessEvePage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <EveHarnessChat apiRoute="/api/harness/eve/basic" exampleLabel="Basic" />
    </ChatIdProvider>
  );
}
