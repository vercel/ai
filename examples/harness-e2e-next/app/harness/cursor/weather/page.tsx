import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'Cursor — Weather',
};

const STORAGE_KEY = 'harness-cursor-weather-chat-id';

export default function CursorWeatherPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/cursor/weather"
        exampleLabel="Weather"
        harnessLabel="Cursor"
      />
    </ChatIdProvider>
  );
}
