import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'ACP: Codex — Weather Only',
};

const STORAGE_KEY = 'harness-acp-codex-weather-only-chat-id';

export default function CodexACPWeatherOnlyPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/acp-codex/weather-only"
        exampleLabel="Weather Only"
        harnessLabel="ACP: Codex"
      />
    </ChatIdProvider>
  );
}
