import ChatIdProvider from '@/components/chat-id-provider';
import ClineHarnessChat from '@/components/cline-harness-chat';

export const metadata = {
  title: 'Cline — Workflow (Timed)',
};

const STORAGE_KEY = 'harness-cline-workflow-timed-chat-id';

export default function HarnessClineWorkflowTimedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ClineHarnessChat
        apiRoute="/api/harness/cline/workflow-timed"
        exampleLabel="Workflow (Timed)"
      />
    </ChatIdProvider>
  );
}
