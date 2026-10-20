import ChatIdProvider from '@/components/chat-id-provider';
import CodexHarnessChat from '@/components/codex-harness-chat';

export const metadata = {
  title: 'Codex — Workflow (Stepped)',
};

const STORAGE_KEY = 'harness-codex-workflow-stepped-chat-id';

export default function HarnessWorkflowSteppedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <CodexHarnessChat
        apiRoute="/api/harness/codex/workflow-stepped"
        exampleLabel="Workflow (Stepped)"
      />
    </ChatIdProvider>
  );
}
