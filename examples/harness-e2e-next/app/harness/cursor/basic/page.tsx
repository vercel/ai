import ChatIdProvider from '@/components/chat-id-provider';
import CursorHarnessChat from '@/components/cursor-harness-chat';

export const metadata = {
  title: 'Cursor — Basic',
};

const STORAGE_KEY = 'harness-cursor-basic-chat-id';

export default function HarnessCursorPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <CursorHarnessChat
        apiRoute="/api/harness/cursor/basic"
        exampleLabel="Basic"
      />
    </ChatIdProvider>
  );
}
