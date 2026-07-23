import ChatIdProvider from '@/components/chat-id-provider';
import DeepAgentsHarnessChat from '@/components/deepagents-harness-chat';

export const metadata = {
  title: 'Deep Agents — Workflow (Stepped)',
};

const STORAGE_KEY = 'harness-deepagents-workflow-stepped-chat-id';

export default function HarnessWorkflowSteppedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <DeepAgentsHarnessChat
        apiRoute="/api/harness/deepagents/workflow-stepped"
        exampleLabel="Workflow (Stepped)"
      />
    </ChatIdProvider>
  );
}
