import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'Grok Build — Workflow (Stepped)',
};

const STORAGE_KEY = 'harness-grok-build-workflow-stepped-chat-id';

export default function GrokBuildWorkflowSteppedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/grok-build/workflow-stepped"
        exampleLabel="Workflow (Stepped)"
        harnessLabel="Grok Build"
      />
    </ChatIdProvider>
  );
}
