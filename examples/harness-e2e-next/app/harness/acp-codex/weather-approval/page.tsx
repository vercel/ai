import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'ACP: Codex — Weather Approval',
};

const STORAGE_KEY = 'harness-acp-codex-weather-approval-chat-id';

export default function CodexACPWeatherApprovalPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/acp-codex/weather-approval"
        exampleLabel="Weather Approval"
        harnessLabel="ACP: Codex"
      />
    </ChatIdProvider>
  );
}
