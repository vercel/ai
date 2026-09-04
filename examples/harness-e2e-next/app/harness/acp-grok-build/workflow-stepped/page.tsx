import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'ACP: Grok Build — Workflow (Stepped)',
};

const STORAGE_KEY = 'harness-acp-grok-build-workflow-stepped-chat-id';

export default function GrokBuildACPWorkflowSteppedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/acp-grok-build/workflow-stepped"
        exampleLabel="Workflow (Stepped)"
        harnessLabel="ACP: Grok Build"
      />
    </ChatIdProvider>
  );
}
