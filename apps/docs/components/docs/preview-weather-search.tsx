'use client';

import {
  ConversationReplay,
  type SimulationMessage,
} from './preview-conversation';
import { WeatherCard } from './weather-card';

interface WeatherResult {
  weather: { temperature: number; condition: string };
}

const messages: SimulationMessage<WeatherResult>[] = [
  { role: 'user', content: 'What is the weather in SF?' },
  { role: 'tool-call', name: 'getWeather("San Francisco")' },
  {
    role: 'tool-result',
    name: 'getWeather("San Francisco")',
    result: { weather: { temperature: 47, condition: 'sunny' } },
  },
  { role: 'user', content: 'Thanks!' },
];

/**
 * Simulated weather lookup: a user question, a tool call, and a streamed
 * `<WeatherCard />` (ported from the legacy ai-sdk.dev app).
 */
export const WeatherSearchSimulation = ({
  isPlaying = false,
}: {
  isPlaying?: boolean;
}) => (
  <ConversationReplay
    height={356}
    holdDelay={3000}
    isPlaying={isPlaying}
    messages={messages}
    renderResult={({ result }) => <WeatherCard content={result} />}
  />
);
