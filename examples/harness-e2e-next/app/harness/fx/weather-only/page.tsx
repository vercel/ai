import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'fx — Weather Only',
};

const STORAGE_KEY = 'harness-fx-weather-only-chat-id';

export default function FxWeatherOnlyPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/fx/weather-only"
        exampleLabel="Weather Only"
        harnessLabel="fx"
      />
    </ChatIdProvider>
  );
}
