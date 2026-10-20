import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'ACP: Codex — Workflow (Stepped)',
};

const STORAGE_KEY = 'harness-acp-codex-workflow-stepped-chat-id';

export default function CodexACPWorkflowSteppedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/acp-codex/workflow-stepped"
        exampleLabel="Workflow (Stepped)"
        harnessLabel="ACP: Codex"
      />
    </ChatIdProvider>
  );
}
