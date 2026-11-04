import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'fx — Weather Approval',
};

const STORAGE_KEY = 'harness-fx-weather-approval-chat-id';

export default function FxWeatherApprovalPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/fx/weather-approval"
        exampleLabel="Weather Approval"
        harnessLabel="fx"
      />
    </ChatIdProvider>
  );
}
