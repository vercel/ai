import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'Grok Build — Weather Only',
};

const STORAGE_KEY = 'harness-grok-build-weather-only-chat-id';

export default function GrokBuildWeatherOnlyPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/grok-build/weather-only"
        exampleLabel="Weather Only"
        harnessLabel="Grok Build"
      />
    </ChatIdProvider>
  );
}
