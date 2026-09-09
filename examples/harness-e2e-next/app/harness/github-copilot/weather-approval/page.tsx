import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'GitHub Copilot — Weather Approval',
};

const STORAGE_KEY = 'harness-github-copilot-weather-approval-chat-id';

export default function GitHubCopilotWeatherApprovalPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/github-copilot/weather-approval"
        exampleLabel="Weather Approval"
        harnessLabel="GitHub Copilot"
      />
    </ChatIdProvider>
  );
}
