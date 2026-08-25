import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'Cursor — Basic (with stop)',
};

const STORAGE_KEY = 'harness-cursor-basic-with-stop-chat-id';

export default function CursorBasicWithStopPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/cursor/basic-with-stop"
        exampleLabel="Basic (with stop)"
        harnessLabel="Cursor"
      />
    </ChatIdProvider>
  );
}
