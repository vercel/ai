import ChatIdProvider from '@/components/chat-id-provider';
import ACPHarnessChat from '@/components/acp-harness-chat';

export const metadata = {
  title: 'GitHub Copilot — Basic',
};

const STORAGE_KEY = 'harness-github-copilot-basic-chat-id';

export default function GitHubCopilotBasicPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <ACPHarnessChat
        apiRoute="/api/harness/github-copilot/basic"
        exampleLabel="Basic"
        harnessLabel="GitHub Copilot"
      />
    </ChatIdProvider>
  );
}
