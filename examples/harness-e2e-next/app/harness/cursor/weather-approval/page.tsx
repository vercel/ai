import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'Cursor — Weather Approval',
};

const STORAGE_KEY = 'harness-cursor-weather-approval-chat-id';

export default function CursorWeatherApprovalPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/cursor/weather-approval"
        exampleLabel="Weather Approval"
        harnessLabel="Cursor"
      />
    </ChatIdProvider>
  );
}
