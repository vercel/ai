import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'Cursor — Weather Only',
};

const STORAGE_KEY = 'harness-cursor-weather-only-chat-id';

export default function CursorWeatherOnlyPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/cursor/weather-only"
        exampleLabel="Weather Only"
        harnessLabel="Cursor"
      />
    </ChatIdProvider>
  );
}
