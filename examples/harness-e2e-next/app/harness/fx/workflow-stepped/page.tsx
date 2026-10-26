import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'fx — Workflow (Stepped)',
};

const STORAGE_KEY = 'harness-fx-workflow-stepped-chat-id';

export default function FxWorkflowSteppedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/fx/workflow-stepped"
        exampleLabel="Workflow (Stepped)"
        harnessLabel="fx"
      />
    </ChatIdProvider>
  );
}
