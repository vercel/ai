import ChatIdProvider from '@/components/chat-id-provider';
import OpenCodeHarnessChat from '@/components/opencode-harness-chat';

export const metadata = {
  title: 'OpenCode — Workflow (Stepped)',
};

const STORAGE_KEY = 'harness-opencode-workflow-stepped-chat-id';

export default function HarnessWorkflowSteppedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <OpenCodeHarnessChat
        apiRoute="/api/harness/opencode/workflow-stepped"
        exampleLabel="Workflow (Stepped)"
      />
    </ChatIdProvider>
  );
}
