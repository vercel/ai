import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'ACP: Claude Code — Workflow (Stepped)',
};

const STORAGE_KEY = 'harness-acp-claude-code-workflow-stepped-chat-id';

export default function ClaudeCodeACPWorkflowSteppedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/acp-claude-code/workflow-stepped"
        exampleLabel="Workflow (Stepped)"
        harnessLabel="ACP: Claude Code"
      />
    </ChatIdProvider>
  );
}
