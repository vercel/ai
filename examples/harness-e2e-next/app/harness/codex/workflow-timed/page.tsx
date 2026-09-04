import ChatIdProvider from '@/components/chat-id-provider';
import CodexHarnessChat from '@/components/codex-harness-chat';

export const metadata = {
  title: 'Codex — Workflow (Timed)',
};

const STORAGE_KEY = 'harness-codex-workflow-timed-chat-id';

export default function HarnessCodexWorkflowTimedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <CodexHarnessChat
        apiRoute="/api/harness/codex/workflow-timed"
        exampleLabel="Workflow (Timed)"
      />
    </ChatIdProvider>
  );
}
