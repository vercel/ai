import ChatIdProvider from '@/components/chat-id-provider';
import WeatherClineHarnessChat from '@/components/weather-cline-harness-chat';

export const metadata = {
  title: 'Cline — Weather',
};

const STORAGE_KEY = 'harness-cline-weather-chat-id';

export default function HarnessClineWeatherPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherClineHarnessChat
        apiRoute="/api/harness/cline/weather"
        exampleLabel="Weather"
      />
    </ChatIdProvider>
  );
}
