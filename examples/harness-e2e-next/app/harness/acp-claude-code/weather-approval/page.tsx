import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'ACP: Claude Code — Weather Approval',
};

const STORAGE_KEY = 'harness-acp-claude-code-weather-approval-chat-id';

export default function ClaudeCodeACPWeatherApprovalPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/acp-claude-code/weather-approval"
        exampleLabel="Weather Approval"
        harnessLabel="ACP: Claude Code"
      />
    </ChatIdProvider>
  );
}
