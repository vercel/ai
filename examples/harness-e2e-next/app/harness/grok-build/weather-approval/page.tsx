import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'Grok Build — Weather Approval',
};

const STORAGE_KEY = 'harness-grok-build-weather-approval-chat-id';

export default function GrokBuildWeatherApprovalPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/grok-build/weather-approval"
        exampleLabel="Weather Approval"
        harnessLabel="Grok Build"
      />
    </ChatIdProvider>
  );
}
