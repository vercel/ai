import ChatIdProvider from '@/components/chat-id-provider';
import ClineHarnessChat from '@/components/cline-harness-chat';

export const metadata = {
  title: 'Cline — Workflow (Stepped)',
};

const STORAGE_KEY = 'harness-cline-workflow-stepped-chat-id';

export default function HarnessWorkflowSteppedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ClineHarnessChat
        apiRoute="/api/harness/cline/workflow-stepped"
        exampleLabel="Workflow (Stepped)"
      />
    </ChatIdProvider>
  );
}
