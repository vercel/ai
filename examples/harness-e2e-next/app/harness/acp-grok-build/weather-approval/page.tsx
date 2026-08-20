import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'ACP: Grok Build — Weather Approval',
};

const STORAGE_KEY = 'harness-acp-grok-build-weather-approval-chat-id';

export default function GrokBuildACPWeatherApprovalPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/acp-grok-build/weather-approval"
        exampleLabel="Weather Approval"
        harnessLabel="ACP: Grok Build"
      />
    </ChatIdProvider>
  );
}
