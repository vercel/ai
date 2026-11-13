import ChatIdProvider from '@/components/chat-id-provider';
import PiHarnessChat from '@/components/pi-harness-chat';

export const metadata = {
  title: 'Pi — Basic',
};

const STORAGE_KEY = 'durable-harness-pi-basic-chat-id';

export default function HarnessPiPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <PiHarnessChat apiRoute="/api/chat" exampleLabel="Basic" />
    </ChatIdProvider>
  );
}
