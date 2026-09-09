import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'GitHub Copilot — Workflow (Timed)',
};

const STORAGE_KEY = 'harness-github-copilot-workflow-timed-chat-id';

export default function GitHubCopilotWorkflowTimedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/github-copilot/workflow-timed"
        exampleLabel="Workflow (Timed)"
        harnessLabel="GitHub Copilot"
      />
    </ChatIdProvider>
  );
}
