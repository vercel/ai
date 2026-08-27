import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'fx — Workflow (Timed)',
};

const STORAGE_KEY = 'harness-fx-workflow-timed-chat-id';

export default function FxWorkflowTimedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/fx/workflow-timed"
        exampleLabel="Workflow (Timed)"
        harnessLabel="fx"
      />
    </ChatIdProvider>
  );
}
