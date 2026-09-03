import ChatIdProvider from '@/components/chat-id-provider';
import WeatherClineHarnessChat from '@/components/weather-cline-harness-chat';

export const metadata = {
  title: 'Cline — Weather Approval',
};

const STORAGE_KEY = 'harness-cline-weather-approval-chat-id';

export default function HarnessClineWeatherApprovalPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherClineHarnessChat
        apiRoute="/api/harness/cline/weather-approval"
        exampleLabel="Weather Approval"
      />
    </ChatIdProvider>
  );
}
