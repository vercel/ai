import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'fx — Weather',
};

const STORAGE_KEY = 'harness-fx-weather-chat-id';

export default function FxWeatherPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/fx/weather"
        exampleLabel="Weather"
        harnessLabel="fx"
      />
    </ChatIdProvider>
  );
}
