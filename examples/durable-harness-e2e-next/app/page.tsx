import ChatIdProvider from '@/components/chat-id-provider';
import SessionHarnessChat from '@/components/session-harness-chat';

export const metadata = {
  title: 'Basic',
};

const STORAGE_KEY = 'durable-harness-basic-chat-id';

export default function HarnessPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <SessionHarnessChat exampleLabel="Basic" />
    </ChatIdProvider>
  );
}
