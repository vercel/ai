import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'Cursor — Workflow (Timed)',
};

const STORAGE_KEY = 'harness-cursor-workflow-timed-chat-id';

export default function CursorWorkflowTimedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/cursor/workflow-timed"
        exampleLabel="Workflow (Timed)"
        harnessLabel="Cursor"
      />
    </ChatIdProvider>
  );
}
