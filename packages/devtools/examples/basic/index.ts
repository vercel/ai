import {
  gateway,
  isStepCount,
  registerTelemetryIntegration,
  streamText,
} from 'ai';
import { tools } from './tools';
import { DevToolsTelemetry } from '../../src';
import { print } from './utils';
import 'dotenv/config';

registerTelemetryIntegration(DevToolsTelemetry());

const result = streamText({
  model: gateway('anthropic/claude-haiku-4.5'),
  system: 'Always call the weather before recommending plans.',
  prompt: 'Whats the weather in SF and London in C?',
  tools,
  stopWhen: isStepCount(5),
  experimental_telemetry: { isEnabled: true },
  providerOptions: {
    anthropic: {
      thinking: {
        type: 'enabled',
        budgetTokens: 10000,
      },
    },
  },
});

print(await result.content);
