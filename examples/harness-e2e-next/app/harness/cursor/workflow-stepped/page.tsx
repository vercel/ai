import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'Cursor — Workflow (Stepped)',
};

const STORAGE_KEY = 'harness-cursor-workflow-stepped-chat-id';

export default function CursorWorkflowSteppedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/cursor/workflow-stepped"
        exampleLabel="Workflow (Stepped)"
        harnessLabel="Cursor"
      />
    </ChatIdProvider>
  );
}
