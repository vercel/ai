import ChatIdProvider from '@/components/chat-id-provider';
import DeepAgentsHarnessChat from '@/components/deepagents-harness-chat';

export const metadata = {
  title: 'Deep Agents — Workflow (Timed)',
};

const STORAGE_KEY = 'harness-deepagents-workflow-timed-chat-id';

export default function HarnessDeepAgentsWorkflowTimedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <DeepAgentsHarnessChat
        apiRoute="/api/harness/deepagents/workflow-timed"
        exampleLabel="Workflow (Timed)"
      />
    </ChatIdProvider>
  );
}
