import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'ACP: Codex — Weather',
};

const STORAGE_KEY = 'harness-acp-codex-weather-chat-id';

export default function CodexACPWeatherPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/acp-codex/weather"
        exampleLabel="Weather"
        harnessLabel="ACP: Codex"
      />
    </ChatIdProvider>
  );
}
