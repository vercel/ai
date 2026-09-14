import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'GitHub Copilot — Weather',
};

const STORAGE_KEY = 'harness-github-copilot-weather-chat-id';

export default function GitHubCopilotWeatherPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/github-copilot/weather"
        exampleLabel="Weather"
        harnessLabel="GitHub Copilot"
      />
    </ChatIdProvider>
  );
}
