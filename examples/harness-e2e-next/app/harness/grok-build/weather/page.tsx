import ChatIdProvider from '@/components/chat-id-provider';
import WeatherGrokBuildHarnessChat from '@/components/weather-grok-build-harness-chat';

export const metadata = {
  title: 'Grok Build — Weather',
};

const STORAGE_KEY = 'harness-grok-build-weather-chat-id';

export default function HarnessGrokBuildWeatherPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherGrokBuildHarnessChat
        apiRoute="/api/harness/grok-build/weather"
        exampleLabel="Weather"
      />
    </ChatIdProvider>
  );
}
