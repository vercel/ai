import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'ACP: Grok Build — Weather Only',
};

const STORAGE_KEY = 'harness-acp-grok-build-weather-only-chat-id';

export default function GrokBuildACPWeatherOnlyPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/acp-grok-build/weather-only"
        exampleLabel="Weather Only"
        harnessLabel="ACP: Grok Build"
      />
    </ChatIdProvider>
  );
}
