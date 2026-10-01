import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'GitHub Copilot — Weather Only',
};

const STORAGE_KEY = 'harness-github-copilot-weather-only-chat-id';

export default function GitHubCopilotWeatherOnlyPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/github-copilot/weather-only"
        exampleLabel="Weather Only"
        harnessLabel="GitHub Copilot"
      />
    </ChatIdProvider>
  );
}
