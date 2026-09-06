import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'Grok Build — Weather',
};

const STORAGE_KEY = 'harness-grok-build-weather-chat-id';

export default function GrokBuildWeatherPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/grok-build/weather"
        exampleLabel="Weather"
        harnessLabel="Grok Build"
      />
    </ChatIdProvider>
  );
}
