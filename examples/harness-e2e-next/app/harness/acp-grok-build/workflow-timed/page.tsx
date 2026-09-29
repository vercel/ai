import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'ACP: Grok Build — Workflow (Timed)',
};

const STORAGE_KEY = 'harness-acp-grok-build-workflow-timed-chat-id';

export default function GrokBuildACPWorkflowTimedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/acp-grok-build/workflow-timed"
        exampleLabel="Workflow (Timed)"
        harnessLabel="ACP: Grok Build"
      />
    </ChatIdProvider>
  );
}
