import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'ACP: Claude Code — Workflow (Timed)',
};

const STORAGE_KEY = 'harness-acp-claude-code-workflow-timed-chat-id';

export default function ClaudeCodeACPWorkflowTimedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/acp-claude-code/workflow-timed"
        exampleLabel="Workflow (Timed)"
        harnessLabel="ACP: Claude Code"
      />
    </ChatIdProvider>
  );
}
