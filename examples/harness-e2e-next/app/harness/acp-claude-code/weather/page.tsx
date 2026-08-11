import ChatIdProvider from '@/components/chat-id-provider';
import WeatherACPHarnessChat from '@/components/weather-acp-harness-chat';

export const metadata = {
  title: 'ACP: Claude Code — Weather',
};

const STORAGE_KEY = 'harness-acp-claude-code-weather-chat-id';

export default function ClaudeCodeACPWeatherPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <WeatherACPHarnessChat
        apiRoute="/api/harness/acp-claude-code/weather"
        exampleLabel="Weather"
        harnessLabel="ACP: Claude Code"
      />
    </ChatIdProvider>
  );
}
