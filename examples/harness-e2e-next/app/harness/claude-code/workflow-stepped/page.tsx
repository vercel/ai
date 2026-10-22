import ChatIdProvider from '@/components/chat-id-provider';
import ClaudeCodeHarnessChat from '@/components/claude-code-harness-chat';

export const metadata = {
  title: 'Claude Code — Workflow (Stepped)',
};

const STORAGE_KEY = 'harness-claude-code-workflow-stepped-chat-id';

export default function HarnessWorkflowSteppedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ClaudeCodeHarnessChat
        apiRoute="/api/harness/claude-code/workflow-stepped"
        exampleLabel="Workflow (Stepped)"
      />
    </ChatIdProvider>
  );
}
