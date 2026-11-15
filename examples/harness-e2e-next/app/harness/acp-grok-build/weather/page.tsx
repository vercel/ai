import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'ACP: Grok Build — Weather',
};

const STORAGE_KEY = 'harness-acp-grok-build-weather-chat-id';

export default function GrokBuildACPWeatherPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/acp-grok-build/weather"
        exampleLabel="Weather"
        harnessLabel="ACP: Grok Build"
      />
    </ChatIdProvider>
  );
}
