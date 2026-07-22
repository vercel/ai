import ChatIdProvider from '@/components/chat-id-provider';
import ClaudeCodeHarnessChat from '@/components/claude-code-harness-chat';

export const metadata = {
  title: 'Claude Code — Workflow (Timed)',
};

const STORAGE_KEY = 'harness-claude-code-workflow-timed-chat-id';

export default function HarnessClaudeCodeWorkflowTimedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ClaudeCodeHarnessChat
        apiRoute="/api/harness/claude-code/workflow-timed"
        exampleLabel="Workflow (Timed)"
      />
    </ChatIdProvider>
  );
}
