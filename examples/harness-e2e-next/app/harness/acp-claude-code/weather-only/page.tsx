import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'ACP: Claude Code — Weather Only',
};

const STORAGE_KEY = 'harness-acp-claude-code-weather-only-chat-id';

export default function ClaudeCodeACPWeatherOnlyPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/acp-claude-code/weather-only"
        exampleLabel="Weather Only"
        harnessLabel="ACP: Claude Code"
      />
    </ChatIdProvider>
  );
}
